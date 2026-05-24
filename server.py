"""
DingDang Cloud - 讯飞星火批处理API -> 千问(Qwen) API 格式适配器
+ 用户管理系统（邮箱验证、API Key、管理员Token配置）
"""

from flask import Flask, request, Response, send_from_directory
import requests
import json
import time
import uuid
import os
import re
import logging
import hashlib
import secrets
import sqlite3
import smtplib
import email.mime.text
from typing import Dict, Optional
from datetime import datetime, timedelta
from itsdangerous import URLSafeTimedSerializer
from functools import wraps
from collections import defaultdict
import threading
import hmac
import base64
import random
import string
import io
import tempfile
from PIL import Image, ImageDraw, ImageFont

# ==================== 加载配置文件 ====================

import yaml

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.yml')

def load_config():
    cfg = {}
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            cfg = yaml.safe_load(f) or {}
    cfg.setdefault('app', {})
    cfg['app']['secret_key'] = os.environ.get('YML_SECRET_KEY',
        cfg['app'].get('secret_key', 'dingdang-cloud-secret-key-2026'))
    cfg['app']['host'] = os.environ.get('YML_HOST',
        cfg['app'].get('host', '0.0.0.0'))
    cfg['app']['port'] = int(os.environ.get('YML_PORT',
        cfg['app'].get('port', 8081)))
    cfg['app']['proxy_protocol_version'] = int(os.environ.get('YML_PROXY_PROTOCOL_VERSION',
        cfg['app'].get('proxy_protocol_version', 0)))
    cfg.setdefault('smtp', {})
    cfg['smtp']['display_name'] = os.environ.get('YML_SMTP_DISPLAY_NAME',
        cfg['smtp'].get('display_name', 'DingDang Cloud'))
    cfg['smtp']['sender_email'] = os.environ.get('YML_SMTP_SENDER_EMAIL',
        cfg['smtp'].get('sender_email', ''))
    cfg['smtp']['username'] = os.environ.get('YML_SMTP_USERNAME',
        cfg['smtp'].get('username', ''))
    cfg['smtp']['password'] = os.environ.get('YML_SMTP_PASSWORD',
        cfg['smtp'].get('password', ''))
    cfg['smtp']['server'] = os.environ.get('YML_SMTP_SERVER',
        cfg['smtp'].get('server', ''))
    cfg['smtp']['port'] = int(os.environ.get('YML_SMTP_PORT',
        cfg['smtp'].get('port', 465)))
    cfg['smtp']['encryption'] = os.environ.get('YML_SMTP_ENCRYPTION',
        cfg['smtp'].get('encryption', 'SSL'))
    cfg.setdefault('api', {})
    cfg['api']['xfyun_password'] = os.environ.get('YML_XFYUN_PASSWORD',
        cfg['api'].get('xfyun_password', ''))
    cfg.setdefault('tdengine', {})
    cfg['tdengine']['host'] = os.environ.get('YML_TDENGINE_HOST',
        cfg['tdengine'].get('host', '127.0.0.1'))
    cfg['tdengine']['port'] = int(os.environ.get('YML_TDENGINE_PORT',
        cfg['tdengine'].get('port', 6041)))
    cfg['tdengine']['password'] = os.environ.get('YML_TDENGINE_PASSWORD',
        cfg['tdengine'].get('password', 'sh1990130'))
    cfg['tdengine']['user'] = os.environ.get('YML_TDENGINE_USER',
        cfg['tdengine'].get('user', 'root'))
    return cfg

CFG = load_config()

app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False
app.config['JSONIFY_MIMETYPE'] = 'application/json; charset=utf-8'
app.config['SECRET_KEY'] = CFG['app']['secret_key']
app.config['TOKEN_SERIALIZER'] = URLSafeTimedSerializer(app.config['SECRET_KEY'])

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data.db')
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)),
    'frontend', 'dist')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

import sys
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# ==================== TDengine 连接器 ====================

import requests as td_requests
import base64 as td_base64

class TDengineClient:
    def __init__(self):
        self.host = CFG['tdengine']['host']
        self.port = CFG['tdengine']['port']
        self.user = CFG['tdengine']['user']
        self.password = CFG['tdengine']['password']
        self.base_url = f"http://{self.host}:{self.port}/rest/sql"
        auth_str = td_base64.b64encode(
            f"{self.user}:{self.password}".encode()).decode()
        self.headers = {
            'Authorization': f"Basic {auth_str}",
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        self.available = False
        self._check_connection()

    def _check_connection(self):
        try:
            r = td_requests.post(self.base_url,
                data="SELECT 1", headers=self.headers, timeout=3)
            self.available = r.status_code == 200
            if self.available:
                self._init_tables()
        except Exception:
            self.available = False
        if not self.available:
            logger.warning("TDengine 不可用，将使用 SQLite 作为后端")

    def _init_tables(self):
        try:
            self.query("CREATE DATABASE IF NOT EXISTS dingdang_cloud")
            self.query("USE dingdang_cloud")
            self.query(
                "CREATE STABLE IF NOT EXISTS notifications ("
                "ts TIMESTAMP, user_id INT, is_read TINYINT, "
                "is_claimed TINYINT, read_at TIMESTAMP, claimed_at TIMESTAMP) "
                "TAGS(notification_id INT, subject NCHAR(256), "
                "body NCHAR(1024), type NCHAR(32), token_amount INT, "
                "admin_name NCHAR(64))")
        except Exception as e:
            logger.warning(f"TDengine 初始化失败: {e}")
            self.available = False

    def query(self, sql: str) -> list:
        if not self.available:
            return []
        try:
            r = td_requests.post(self.base_url, data=sql,
                headers=self.headers, timeout=5)
            if r.status_code == 200:
                data = r.json()
                return data.get('data', [])
        except Exception:
            pass
        return []

    def insert_notification(self, user_id: int, notification_id: int,
                            subject: str, body: str, ntype: str,
                            token_amount: int, admin_name: str):
        if not self.available:
            return
        sql = (
            f"INSERT INTO dingdang_cloud.user_notif_{user_id} "
            f"USING dingdang_cloud.notifications TAGS("
            f"{notification_id}, '{subject.replace(chr(39), chr(39)*2)}', "
            f"'{body.replace(chr(39), chr(39)*2)}', '{ntype}', "
            f"{token_amount}, '{admin_name.replace(chr(39), chr(39)*2)}') "
            f"VALUES (NOW(), {user_id}, 0, 0, NULL, NULL)")
        try:
            td_requests.post(self.base_url, data=sql,
                headers=self.headers, timeout=5)
        except Exception:
            pass

    def update_read(self, user_id: int, user_notification_id: int):
        if not self.available:
            return
        self.query(
            f"UPDATE dingdang_cloud.user_notif_{user_id} "
            f"SET is_read = 1, read_at = NOW() "
            f"WHERE _rowid = {user_notification_id}")

    def update_claimed(self, user_id: int, user_notification_id: int):
        if not self.available:
            return
        self.query(
            f"UPDATE dingdang_cloud.user_notif_{user_id} "
            f"SET is_claimed = 1, claimed_at = NOW() "
            f"WHERE _rowid = {user_notification_id}")

    def delete_entry(self, user_id: int, user_notification_id: int):
        if not self.available:
            return
        self.query(
            f"DELETE FROM dingdang_cloud.user_notif_{user_id} "
            f"WHERE _rowid = {user_notification_id}")

    def cleanup_old(self, days: int = 30):
        if not self.available:
            return 0
        result = self.query(
            f"DELETE FROM dingdang_cloud.notifications "
            f"WHERE ts < NOW() - {days}d")
        return len(result) if result else 0


tdengine = TDengineClient()

# ==================== 数据库连接池 ====================

_db_local = threading.local()

class _PooledConnection:
    __slots__ = ('_conn',)

    def __init__(self, conn):
        object.__setattr__(self, '_conn', conn)

    def close(self):
        pass

    def __getattr__(self, name):
        return getattr(object.__getattribute__(self, '_conn'), name)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


def get_db():
    if hasattr(_db_local, 'pooled'):
        try:
            _db_local.pooled.execute("SELECT 1")
            return _db_local.pooled
        except Exception:
            try:
                object.__getattribute__(_db_local.pooled, '_conn').close()
            except Exception:
                pass
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-8000")
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute("PRAGMA mmap_size=268435456")
    _db_local.pooled = _PooledConnection(conn)
    return _db_local.pooled


# ==================== 数据库初始化 ====================

def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            username TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            api_key TEXT UNIQUE,
            is_verified INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            remaining_tokens INTEGER DEFAULT 10000,
            max_concurrent INTEGER DEFAULT 20,
            priority INTEGER DEFAULT 2,
            failed_login_attempts INTEGER DEFAULT 0,
            locked_until TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS email_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            purpose TEXT DEFAULT 'register',
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            failed_attempts INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS token_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chinese_ratio REAL DEFAULT 2.0,
            english_ratio REAL DEFAULT 4.0,
            other_ratio REAL DEFAULT 2.0,
            updated_by INTEGER,
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS api_usage_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            api_key TEXT,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS user_concurrent (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            api_key TEXT,
            request_id TEXT,
            started_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS api_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            user_id INTEGER,
            permissions TEXT DEFAULT 'read',
            expires_at TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS user_spaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            tokens INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS space_contexts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            space_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
            content TEXT NOT NULL,
            token_count INTEGER DEFAULT 0,
            room_id TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (space_id) REFERENCES user_spaces(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS user_context_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            max_context_messages INTEGER DEFAULT 20,
            max_context_tokens INTEGER DEFAULT 4000,
            auto_summary INTEGER DEFAULT 0,
            summary_model TEXT DEFAULT 'qwen',
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    ''')
    conn.commit()

    for col in ['remaining_tokens', 'max_concurrent', 'priority',
                'failed_login_attempts', 'locked_until']:
        try:
            conn.execute(f"ALTER TABLE users ADD COLUMN {col} " + {
                'remaining_tokens': 'INTEGER DEFAULT 10000',
                'max_concurrent': 'INTEGER DEFAULT 20',
                'priority': 'INTEGER DEFAULT 2',
                'failed_login_attempts': 'INTEGER DEFAULT 0',
                'locked_until': 'TEXT'
            }.get(col, ''))
            conn.commit()
        except Exception:
            pass

    for col in ['tokens']:
        try:
            conn.execute(
                "ALTER TABLE user_spaces ADD COLUMN tokens INTEGER DEFAULT 0")
            conn.commit()
        except Exception:
            pass

    # Add room_id column to space_contexts if not present (for backward compatibility)
    try:
        conn.execute("ALTER TABLE space_contexts ADD COLUMN room_id TEXT DEFAULT NULL")
        conn.commit()
    except Exception:
        pass

    try:
        conn.execute(
            "ALTER TABLE user_notifications ADD COLUMN is_claimed INTEGER DEFAULT 0")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(
            "ALTER TABLE user_notifications ADD COLUMN claimed_at TEXT")
        conn.commit()
    except Exception:
        pass

    conn.execute('''
        CREATE TABLE IF NOT EXISTS admin_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            type TEXT DEFAULT 'announcement',
            token_amount INTEGER DEFAULT 0,
            target_type TEXT DEFAULT 'all',
            target_user_id INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (admin_id) REFERENCES users(id)
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS user_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            notification_id INTEGER NOT NULL,
            is_read INTEGER DEFAULT 0,
            read_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (notification_id) REFERENCES admin_notifications(id) ON DELETE CASCADE
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS admin_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER,
            admin_name TEXT,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id INTEGER,
            details TEXT,
            ip_address TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS ip_bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT NOT NULL,
            reason TEXT NOT NULL,
            ban_type TEXT NOT NULL DEFAULT 'auto',
            banned_by INTEGER,
            is_active INTEGER DEFAULT 1,
            expires_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS ip_tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT NOT NULL,
            endpoint TEXT,
            user_agent TEXT,
            fingerprint TEXT,
            request_count INTEGER DEFAULT 1,
            first_seen TEXT DEFAULT (datetime('now')),
            last_seen TEXT DEFAULT (datetime('now')),
            UNIQUE(ip_address, endpoint)
        )
    ''')
    conn.commit()

    admin = conn.execute("SELECT id FROM users WHERE email = ?",
        ('admin@company.com',)).fetchone()
    if not admin:
        admin_password = secrets.token_urlsafe(16)
        admin_hash = hashlib.sha256(admin_password.encode()).hexdigest()
        admin_api_key = secrets.token_hex(32)
        conn.execute(
            "INSERT INTO users (email, password_hash, username, role, "
            "api_key, is_verified) VALUES (?, ?, ?, ?, ?, 1)",
            ('admin@company.com', admin_hash, 'admin', 'admin', admin_api_key)
        )
        conn.commit()
        logger.info("=" * 60)
        logger.info("管理员账户已创建")
        logger.info(f"  邮箱: admin@company.com")
        logger.info(f"  密码: {admin_password}")
        logger.info("=" * 60)

    cfg_row = conn.execute("SELECT id FROM token_config LIMIT 1").fetchone()
    if not cfg_row:
        conn.execute("INSERT INTO token_config (chinese_ratio, english_ratio, "
            "other_ratio) VALUES (2.0, 4.0, 2.0)")
        conn.commit()

    conn.close()

# ==================== 获取客户端真实IP ====================

def get_client_ip():
    proxy_protocol_version = CFG['app'].get('proxy_protocol_version', 0)

    if proxy_protocol_version == 1:
        forwarded_for = request.headers.get('X-Forwarded-For')
        if forwarded_for:
            try:
                ip = forwarded_for.split(',')[0].strip()
                if is_valid_ip(ip):
                    return ip
            except Exception:
                pass

        x_real_ip = request.headers.get('X-Real-IP')
        if x_real_ip and is_valid_ip(x_real_ip.strip()):
            return x_real_ip.strip()

        x_forwarded = request.headers.get('X-Forwarded')
        if x_forwarded:
            try:
                parts = x_forwarded.split()
                for part in parts:
                    if is_valid_ip(part.strip()):
                        return part.strip()
            except Exception:
                pass

    elif proxy_protocol_version == 2:
        x_real_ip = request.headers.get('X-Real-IP')
        if x_real_ip and is_valid_ip(x_real_ip.strip()):
            return x_real_ip.strip()

        forwarded_for = request.headers.get('X-Forwarded-For')
        if forwarded_for:
            try:
                ip = forwarded_for.split(',')[0].strip()
                if is_valid_ip(ip):
                    return ip
            except Exception:
                pass

    else:
        forwarded_for = request.headers.get('X-Forwarded-For')
        if forwarded_for:
            try:
                ip = forwarded_for.split(',')[0].strip()
                if is_valid_ip(ip):
                    return ip
            except Exception:
                pass

        x_real_ip = request.headers.get('X-Real-IP')
        if x_real_ip and is_valid_ip(x_real_ip.strip()):
            return x_real_ip.strip()

        x_forwarded = request.headers.get('X-Forwarded')
        if x_forwarded:
            try:
                parts = x_forwarded.split()
                for part in parts:
                    if is_valid_ip(part.strip()):
                        return part.strip()
            except Exception:
                pass

    remote = request.remote_addr
    if remote and is_valid_ip(remote):
        return remote
    return remote or '0.0.0.0'

def is_valid_ip(ip: str) -> bool:
    import ipaddress
    try:
        ipaddress.ip_address(ip)
        return True
    except ValueError:
        return False

# ==================== 自定义加密工具 ====================

ENCRYPTION_KEY = hashlib.sha256(CFG['app']['secret_key'].encode()).digest()

def encrypt_token(data: str) -> str:
    ts = int(time.time())
    payload = f"{data}:{ts}"
    mac = hmac.new(ENCRYPTION_KEY, payload.encode(), hashlib.sha256).hexdigest()[:16]
    combined = f"{payload}:{mac}"
    return base64.urlsafe_b64encode(combined.encode()).decode().rstrip('=')

def decrypt_token(token: str) -> Optional[Dict]:
    try:
        padded = token + '=' * (4 - len(token) % 4) if len(token) % 4 else token
        decoded = base64.urlsafe_b64decode(padded).decode()
        parts = decoded.rsplit(':', 2)
        if len(parts) != 3:
            return None
        data, ts_str, mac = parts
        expected_mac = hmac.new(ENCRYPTION_KEY, f"{data}:{ts_str}".encode(),
            hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(mac, expected_mac):
            return None
        ts = int(ts_str)
        if time.time() - ts > 3600:
            return None
        return json.loads(data)
    except Exception:
        return None

def generate_dynamic_token(user_id: int, permissions: str = 'read') -> str:
    payload = json.dumps({"uid": user_id, "perm": permissions,
        "nonce": secrets.token_hex(4)})
    return encrypt_token(payload)

def verify_dynamic_token(token: str) -> Optional[Dict]:
    return decrypt_token(token)

# ==================== 工具函数 ====================

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def validate_password_strength(password: str):
    if len(password) < 8:
        return (False, "密码至少8位")
    if not re.search(r'[a-z]', password):
        return (False, "密码必须包含小写字母")
    if not re.search(r'\d', password):
        return (False, "密码必须包含数字")
    return (True, "")

def generate_api_key() -> str:
    return secrets.token_hex(32)

def mask_api_key(api_key: str) -> str:
    if not api_key or len(api_key) <= 10:
        return api_key
    return api_key[:6] + '*' * (len(api_key) - 9) + api_key[-3:]

def generate_email_code() -> str:
    return str(secrets.randbelow(900000) + 100000)

def json_response(data, status=200):
    json_str = json.dumps(data, ensure_ascii=False, indent=2)
    response = Response(
        response=json_str,
        status=status,
        mimetype='application/json; charset=utf-8'
    )
    response.headers['Content-Type'] = 'application/json; charset=utf-8'
    return response

# ==================== 安全中间件 ====================

rate_limit_store = defaultdict(list)
rate_limit_lock = threading.Lock()
ip_rate_limit_store = defaultdict(list)
ip_rate_limit_lock = threading.Lock()

# 企业邮箱白名单（为空则不限制）
ENTERPRISE_EMAIL_WHITELIST = set()
_email_whitelist_raw = os.environ.get('YML_EMAIL_WHITELIST',
    CFG['app'].get('email_whitelist', ''))
if _email_whitelist_raw:
    ENTERPRISE_EMAIL_WHITELIST = set(
        d.strip().lower() for d in _email_whitelist_raw.split(',') if d.strip())

# ==================== 图片验证码 ====================

captcha_store = {}
captcha_store_lock = threading.Lock()

def cleanup_captcha_store():
    now = time.time()
    with captcha_store_lock:
        expired = [k for k, v in captcha_store.items() if now - v['ts'] > 300]
        for k in expired:
            del captcha_store[k]

def generate_captcha() -> dict:
    cleanup_captcha_store()
    chars = string.digits
    text = ''.join(random.choices(chars, k=4))
    width, height = 120, 44
    image = Image.new('RGB', (width, height), (245, 247, 250))
    draw = ImageDraw.Draw(image)
    for _ in range(random.randint(3, 6)):
        x1 = random.randint(0, width)
        y1 = random.randint(0, height)
        x2 = random.randint(0, width)
        y2 = random.randint(0, height)
        draw.line([(x1, y1), (x2, y2)], fill=(180, 190, 200), width=1)
    for _ in range(60):
        x = random.randint(0, width)
        y = random.randint(0, height)
        draw.point((x, y), fill=(160, 170, 180))
    x_offset = 10
    for char in text:
        char_img = Image.new('RGBA', (24, 32), (0, 0, 0, 0))
        char_draw = ImageDraw.Draw(char_img)
        r, g = random.randint(30, 100), random.randint(30, 100)
        b = random.randint(30, 100)
        char_draw.text((0, random.randint(-2, 2)), char, fill=(r, g, b))
        angle = random.randint(-25, 25)
        char_img = char_img.rotate(angle, expand=1, fillcolor=(0, 0, 0, 0))
        image.paste(char_img, (x_offset, random.randint(6, 12)), char_img)
        x_offset += random.randint(24, 28)
    buf = io.BytesIO()
    image.save(buf, format='PNG')
    image_data = base64.b64encode(buf.getvalue()).decode()
    captcha_id = uuid.uuid4().hex[:16]
    with captcha_store_lock:
        captcha_store[captcha_id] = {'text': text, 'ts': time.time()}
    return {'captcha_id': captcha_id, 'image': f'data:image/png;base64,{image_data}'}

def verify_captcha(captcha_id: str, captcha_code: str) -> bool:
    if not captcha_id or not captcha_code:
        return False
    cleanup_captcha_store()
    with captcha_store_lock:
        record = captcha_store.pop(captcha_id, None)
    if not record:
        return False
    if time.time() - record['ts'] > 300:
        return False
    return record['text'].lower() == captcha_code.strip().lower()


def check_rate_limit(key: str, max_requests: int = 5,
                     window_seconds: int = 60,
                     user: dict = None) -> bool:
    if user and user.get('role') == 'admin':
        return True
    now = time.time()
    with rate_limit_lock:
        records = rate_limit_store[key]
        records = [t for t in records if now - t < window_seconds]
        if len(records) >= max_requests:
            rate_limit_store[key] = records
            return False
        records.append(now)
        rate_limit_store[key] = records
        return True


def check_ip_rate_limit(ip: str, max_requests: int = 60,
                        window_seconds: int = 60) -> bool:
    now = time.time()
    with ip_rate_limit_lock:
        records = ip_rate_limit_store[ip]
        records = [t for t in records if now - t < window_seconds]
        if len(records) >= max_requests:
            ip_rate_limit_store[ip] = records
            return False
        records.append(now)
        ip_rate_limit_store[ip] = records
        return True


def check_ip_banned(ip: str) -> bool:
    conn = get_db()
    ban = conn.execute(
        "SELECT id FROM ip_bans WHERE ip_address = ? AND is_active = 1 "
        "AND (expires_at IS NULL OR expires_at > datetime('now', 'localtime'))",
        (ip,)).fetchone()
    conn.close()
    return ban is not None


def track_ip_request(ip: str, endpoint: str, user_agent: str = '',
                     fingerprint: str = ''):
    try:
        conn = get_db()
        existing = conn.execute(
            "SELECT id, request_count FROM ip_tracking "
            "WHERE ip_address = ? AND endpoint = ?",
            (ip, endpoint)).fetchone()
        if existing:
            conn.execute(
                "UPDATE ip_tracking SET request_count = request_count + 1, "
                "last_seen = datetime('now') WHERE id = ?",
                (existing['id'],))
        else:
            conn.execute(
                "INSERT INTO ip_tracking (ip_address, endpoint, user_agent, fingerprint) "
                "VALUES (?, ?, ?, ?)",
                (ip, endpoint, user_agent[:200] if user_agent else '',
                 fingerprint[:100] if fingerprint else ''))
        conn.commit()
        conn.close()
    except Exception:
        pass


def check_abnormal_ip(ip: str) -> dict:
    conn = get_db()
    total = conn.execute(
        "SELECT SUM(request_count) as total FROM ip_tracking "
        "WHERE ip_address = ?", (ip,)).fetchone()
    distinct_endpoints = conn.execute(
        "SELECT COUNT(DISTINCT endpoint) as c FROM ip_tracking "
        "WHERE ip_address = ?", (ip,)).fetchone()
    conn.close()
    return {
        "total_requests": total['total'] if total and total['total'] else 0,
        "distinct_endpoints": distinct_endpoints['c'] if distinct_endpoints else 0
    }


def log_admin_action(admin_user: dict, action: str, target_type: str = None,
                     target_id: int = None, details: str = None):
    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO admin_audit_log (admin_id, admin_name, action, "
            "target_type, target_id, details, ip_address) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (admin_user['id'], admin_user.get('username', ''),
             action, target_type, target_id, details, get_client_ip()))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"记录审计日志失败: {e}")


def check_email_whitelist(email: str) -> bool:
    if not ENTERPRISE_EMAIL_WHITELIST:
        return True
    domain = email.split('@')[1].strip().lower() if '@' in email else ''
    return domain in ENTERPRISE_EMAIL_WHITELIST

@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "connect-src 'self' https:; "
        "font-src 'self' data:; "
        "object-src 'none'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = (
        'geolocation=(), microphone=(), camera=(), payment=(), usb=(), '
        'magnetometer=(), accelerometer=(), gyroscope=(), '
        'fullscreen=(self), display-capture=()'
    )
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers.pop('Server', None)
    return response


@app.before_request
def check_global_ip_rate_and_ban():
    client_ip = get_client_ip()
    if client_ip == '0.0.0.0':
        return None
    if check_ip_banned(client_ip):
        return json_response({"error": "您的IP已被封禁"}, 403)
    if not check_ip_rate_limit(client_ip, max_requests=120, window_seconds=60):
        return json_response({"error": "请求过于频繁，系统已限制"}, 429)
    endpoint = request.path
    if endpoint.startswith('/api/') or endpoint.startswith('/v1/'):
        ua = request.headers.get('User-Agent', '')
        track_ip_request(client_ip, endpoint, ua)
    return None


class RemoveServerHeaderMiddleware:
    def __init__(self, app):
        self.app = app
    def __call__(self, environ, start_response):
        def custom_start_response(status, headers, exc_info=None):
            headers = [(k, v) for k, v in headers if k.lower() != 'server']
            return start_response(status, headers, exc_info)
        return self.app(environ, custom_start_response)

app.wsgi_app = RemoveServerHeaderMiddleware(app.wsgi_app)

import werkzeug.serving
werkzeug.serving.WSGIRequestHandler.server_version = ''
werkzeug.serving.WSGIRequestHandler.sys_version = ''

@app.errorhandler(400)
@app.errorhandler(401)
@app.errorhandler(403)
@app.errorhandler(404)
@app.errorhandler(405)
@app.errorhandler(409)
@app.errorhandler(423)
@app.errorhandler(429)
@app.errorhandler(500)
def handle_http_error(error):
    code = error.code if hasattr(error, 'code') else 500
    path = request.path
    if path.startswith('/api/') or path.startswith('/v1/'):
        return json_response(
            {"error": str(error.description) if hasattr(error, 'description') else str(error)},
            code)
    index_path = os.path.join(FRONTEND_DIST, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(FRONTEND_DIST, 'index.html'), code
    return json_response(
        {"error": str(error.description) if hasattr(error, 'description') else str(error)},
        code)

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return json_response({"error": "未提供认证Token"}, 401)
        token = auth_header[7:]
        conn = get_db()
        user = conn.execute("SELECT * FROM users WHERE api_key = ?",
            (token,)).fetchone()
        if not user:
            conn.close()
            return json_response({"error": "无效的API Key"}, 401)
        if not user['is_active']:
            conn.close()
            return json_response({"error": "账户已被禁用"}, 403)
        if not user['is_verified']:
            conn.close()
            return json_response({"error": "请先验证邮箱后再使用API"}, 403)
        request.current_user = dict(user)
        return f(*args, **kwargs)
    return decorated

def require_dynamic_token(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('X-Dynamic-Token', '')
        if not auth_header:
            return json_response({"error": "缺少动态Token"}, 401)
        payload = verify_dynamic_token(auth_header)
        if not payload:
            return json_response({"error": "动态Token无效或已过期"}, 401)
        conn = get_db()
        user = conn.execute("SELECT * FROM users WHERE id = ?",
            (payload['uid'],)).fetchone()
        conn.close()
        if not user:
            return json_response({"error": "用户不存在"}, 401)
        if not user['is_active']:
            return json_response({"error": "账户已被禁用"}, 403)
        request.current_user = dict(user)
        request.dynamic_token_payload = payload
        return f(*args, **kwargs)
    return decorated

def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return json_response({"error": "未提供认证Token"}, 401)
        token = auth_header[7:]
        conn = get_db()
        user = conn.execute("SELECT * FROM users WHERE api_key = ?",
            (token,)).fetchone()
        conn.close()
        if not user:
            return json_response({"error": "无效的API Key"}, 401)
        if user['role'] != 'admin':
            return json_response({"error": "需要管理员权限"}, 403)
        request.current_user = dict(user)
        return f(*args, **kwargs)
    return decorated

def check_concurrent_and_tokens(user_id: int, api_key: str,
                                required_tokens: int,
                                space_id: int = None) -> dict:
    conn = get_db()
    current_concurrent = conn.execute(
        "SELECT COUNT(*) as c FROM user_concurrent WHERE user_id = ?",
        (user_id,)).fetchone()['c']
    user = conn.execute(
        "SELECT max_concurrent, remaining_tokens FROM users WHERE id = ?",
        (user_id,)).fetchone()
    if not user:
        conn.close()
        return {"success": False, "error": "用户不存在"}
    if current_concurrent >= user['max_concurrent']:
        conn.close()
        return {"success": False,
            "error": f"并发数已达上限（当前{current_concurrent}"
                    f"/{user['max_concurrent']}）"}
    if space_id:
        space = conn.execute(
            "SELECT tokens FROM user_spaces WHERE id = ? AND user_id = ?",
            (space_id, user_id)).fetchone()
        if not space:
            conn.close()
            return {"success": False, "error": "空间不存在"}
        if (space['tokens'] or 0) < required_tokens:
            conn.close()
            return {"success": False,
                "error": f"空间Token不足（当前{space['tokens'] or 0}，需要{required_tokens}）"}
    elif user['remaining_tokens'] < required_tokens:
        conn.close()
        return {"success": False,
            "error": f"剩余Token不足（当前{user['remaining_tokens']}，"
                    f"需要{required_tokens}）"}
    conn.close()
    return {"success": True, "remaining_tokens": user['remaining_tokens'],
        "current_concurrent": current_concurrent}

def add_concurrent_request(user_id: int, api_key: str) -> str:
    request_id = f"req-{uuid.uuid4().hex[:12]}"
    conn = get_db()
    conn.execute(
        "INSERT INTO user_concurrent (user_id, api_key, request_id) "
        "VALUES (?, ?, ?)",
        (user_id, api_key, request_id))
    conn.commit()
    conn.close()
    return request_id

def remove_concurrent_request(request_id: str):
    conn = get_db()
    conn.execute("DELETE FROM user_concurrent WHERE request_id = ?",
        (request_id,))
    conn.commit()
    conn.close()


def authenticate_request() -> Optional[Dict]:
    auth_header = request.headers.get('Authorization', '')
    dynamic_token = request.headers.get('X-Dynamic-Token', '')
    if dynamic_token:
        payload = verify_dynamic_token(dynamic_token)
        if payload:
            conn = get_db()
            user = conn.execute(
                "SELECT * FROM users WHERE id = ?",
                (payload['uid'],)).fetchone()
            conn.close()
            if user:
                return user
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        conn = get_db()
        user = conn.execute(
            "SELECT * FROM users WHERE api_key = ?",
            (token,)).fetchone()
        conn.close()
        if user:
            return user
    return None


def validate_user_status(user: Dict):
    if not user['is_active']:
        return json_response({"error": "账户已被禁用"}, 403)
    if not user['is_verified']:
        return json_response({"error": "请先验证邮箱"}, 403)
    return None


def deduct_tokens(user_id: int, tokens: int, space_id: int = None) -> dict:
    conn = get_db()
    conn.execute(
        "UPDATE users SET remaining_tokens = MAX(remaining_tokens - ?, 0), "
        "updated_at = datetime('now') WHERE id = ?",
        (tokens, user_id))
    remaining = conn.execute(
        "SELECT remaining_tokens FROM users WHERE id = ?",
        (user_id,)).fetchone()['remaining_tokens']
    space_remaining = 0
    if space_id:
        conn.execute(
            "UPDATE user_spaces SET tokens = MAX(tokens - ?, 0), "
            "updated_at = datetime('now') WHERE id = ? AND user_id = ?",
            (tokens, space_id, user_id))
        space = conn.execute(
            "SELECT tokens FROM user_spaces WHERE id = ?",
            (space_id,)).fetchone()
        space_remaining = space['tokens'] if space else 0
    conn.commit()
    conn.close()
    return {"remaining_tokens": remaining, "space_tokens": space_remaining}

# ==================== 邮箱服务 ====================

SMTP_CONFIG = {
    'display_name': CFG['smtp']['display_name'],
    'sender_email': CFG['smtp']['sender_email'],
    'username': CFG['smtp']['username'],
    'password': CFG['smtp']['password'],
    'server': CFG['smtp']['server'],
    'port': CFG['smtp']['port'],
    'encryption': CFG['smtp']['encryption']
}

def send_verification_email(to_email: str, code: str,
                            purpose: str = 'register') -> bool:
    try:
        subject_map = {
            'register': 'DingDang Cloud - 邮箱验证码',
            'login': 'DingDang Cloud - 登录验证码',
            'change_password': 'DingDang Cloud - 修改密码验证码'
        }
        subject = subject_map.get(purpose,
            'DingDang Cloud - 验证码')

        email_template_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), 'email.html')
        if os.path.exists(email_template_path):
            with open(email_template_path, 'r', encoding='utf-8') as f:
                html_body = f.read().replace('{{CODE}}', code)
        else:
            html_body = (
                f'<div style="font-family:sans-serif;padding:24px;">'
                f'<h2>邮箱验证</h2>'
                f'<p>您好！请使用以下验证码完成操作：</p>'
                f'<div style="font-size:32px;font-weight:bold;'
                f'color:#6366f1;letter-spacing:8px;padding:16px 0;">{code}</div>'
                f'<p>该验证码5分钟内有效，请勿泄露给他人。</p>'
                f'</div>')

        msg = email.mime.text.MIMEText(html_body, 'html', 'utf-8')
        msg['Subject'] = subject
        sender_display = SMTP_CONFIG['display_name'] or 'DingDang Cloud'
        sender_email = SMTP_CONFIG['sender_email'] or 'noreply@dingdang.cloud'
        msg['From'] = f"{sender_display} <{sender_email}>"
        msg['To'] = to_email

        is_dev_mode = (not SMTP_CONFIG['password'] or
                        'change_me' in str(SMTP_CONFIG['password']).lower() or
                        'company.com' in str(SMTP_CONFIG['server']).lower())

        if is_dev_mode:
            logger.info(f"[DEV] 验证码发送给 {to_email}: {code}")
            logger.warning("SMTP未正确配置，使用开发模式（验证码将记录在日志中）")
            return True

        if SMTP_CONFIG['encryption'] == 'SSL':
            with smtplib.SMTP_SSL(SMTP_CONFIG['server'],
                                  SMTP_CONFIG['port'], timeout=10) as server:
                server.login(SMTP_CONFIG['username'],
                             SMTP_CONFIG['password'])
                server.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_CONFIG['server'],
                              SMTP_CONFIG['port']) as server:
                server.starttls()
                server.login(SMTP_CONFIG['username'],
                             SMTP_CONFIG['password'])
                server.send_message(msg)

        logger.info(f"验证码已发送到 {to_email}")
        return True
    except Exception as e:
        logger.error(f"发送邮件失败: {str(e)}")
        return False


def verify_code_with_limit(email: str, code: str, purpose: str = 'register',
                           max_attempts: int = 3) -> dict:
    conn = get_db()
    record = conn.execute(
        "SELECT * FROM email_verifications WHERE email = ? AND code = ? "
        "AND purpose = ? AND used = 0 ORDER BY id DESC LIMIT 1",
        (email, code, purpose)).fetchone()

    if not record:
        record_any = conn.execute(
            "SELECT id, failed_attempts FROM email_verifications "
            "WHERE email = ? AND purpose = ? AND used = 0 "
            "ORDER BY id DESC LIMIT 1",
            (email, purpose)).fetchone()
        if record_any:
            attempts = (record_any['failed_attempts'] or 0) + 1
            conn.execute(
                "UPDATE email_verifications SET failed_attempts = ? "
                "WHERE id = ?", (attempts, record_any['id']))
            if attempts >= max_attempts:
                conn.execute(
                    "UPDATE email_verifications SET used = 1 WHERE id = ?",
                    (record_any['id'],))
                conn.commit()
                conn.close()
                return {"success": False,
                    "error": "验证码已失效，请重新获取"}
            conn.commit()
        conn.close()
        return {"success": False, "error": "验证码无效"}

    if datetime.now() > datetime.strptime(record['expires_at'],
                                          '%Y-%m-%d %H:%M:%S'):
        conn.execute("UPDATE email_verifications SET used = 1 WHERE id = ?",
            (record['id'],))
        conn.commit()
        conn.close()
        return {"success": False, "error": "验证码已过期"}

    conn.execute("UPDATE email_verifications SET used = 1 WHERE id = ?",
        (record['id'],))
    conn.commit()
    conn.close()
    return {"success": True}


# ==================== 用户认证路由 ====================

@app.route('/api/auth/captcha', methods=['GET'])
def get_captcha():
    client_ip = get_client_ip()
    if not check_rate_limit(f'captcha:{client_ip}',
                            max_requests=10, window_seconds=60):
        return json_response(
            {"error": "操作过于频繁，请稍后再试"}, 429)
    captcha_data = generate_captcha()
    return json_response(captcha_data)


@app.route('/api/auth/register', methods=['POST'])
def register():
    client_ip = get_client_ip()
    if not check_rate_limit(f'register:{client_ip}',
                            max_requests=3, window_seconds=300):
        return json_response(
            {"error": "操作过于频繁，请稍后再试"}, 429)

    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    username = (data.get('username') or '').strip()
    captcha_id = (data.get('captcha_id') or '').strip()
    captcha_code = (data.get('captcha_code') or '').strip()
    code = (data.get('code') or '').strip()

    if not captcha_id or not captcha_code:
        return json_response({"error": "请完成人机验证"}, 400)
    if not verify_captcha(captcha_id, captcha_code):
        return json_response({"error": "验证码错误，请重新验证"}, 400)

    if not email or not re.match(
            r'^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$', email):
        return json_response({"error": "请输入有效的邮箱地址"}, 400)
    if not check_email_whitelist(email):
        return json_response({"error": "该邮箱域名不在允许注册的白名单中"}, 403)
    if len(password) < 8:
        return json_response({"error": "密码至少8位"}, 400)
    valid, msg = validate_password_strength(password)
    if not valid:
        return json_response({"error": msg}, 400)
    if not username:
        return json_response({"error": "请输入用户名"}, 400)
    if not code:
        return json_response({"error": "请先获取邮箱验证码"}, 400)

    result = verify_code_with_limit(email, code, 'register')
    if not result['success']:
        return json_response({"error": result['error']}, 400)

    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE email = ?",
        (email,)).fetchone()
    if existing:
        conn.close()
        return json_response({"error": "该邮箱已注册"}, 409)

    password_hash = hash_password(password)
    conn.execute(
        "INSERT INTO users (email, password_hash, username, is_verified) "
        "VALUES (?, ?, ?, 1)",
        (email, password_hash, username))
    conn.commit()

    user = conn.execute("SELECT * FROM users WHERE email = ?",
        (email,)).fetchone()
    if user and not user['api_key']:
        new_key = generate_api_key()
        conn.execute("UPDATE users SET api_key = ? WHERE id = ?",
            (new_key, user['id']))
        conn.commit()
        user = conn.execute("SELECT * FROM users WHERE email = ?",
            (email,)).fetchone()

    existing_space = conn.execute(
        "SELECT id FROM user_spaces WHERE user_id = ? AND name = '试用'",
        (user['id'],)).fetchone()
    if not existing_space:
        conn.execute(
            "INSERT INTO user_spaces (user_id, name, description, tokens) "
            "VALUES (?, '试用', '专属AI试用空间', ?)",
            (user['id'], user['remaining_tokens']))
        conn.commit()
    conn.close()

    total_token_quota = get_total_token_quota(user['id'])
    return json_response({
        "message": "注册成功",
        "email": email,
        "user": {
            "id": user['id'],
            "email": user['email'],
            "username": user['username'],
            "role": user['role'],
            "is_verified": True,
            "api_key": user['api_key'],
            "remaining_tokens": user['remaining_tokens'],
            "total_token_quota": total_token_quota
        }
    })


@app.route('/api/auth/login', methods=['POST'])
def login():
    client_ip = get_client_ip()
    if not check_rate_limit(f'login:{client_ip}',
                            max_requests=10, window_seconds=60):
        return json_response(
            {"error": "登录尝试过于频繁，请稍后再试"}, 429)

    data = request.get_json()
    account = (data.get('account') or data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    code = data.get('code') or ''

    if account:
        if not check_rate_limit(f'login_account:{client_ip}:{account}',
                                max_requests=10, window_seconds=60):
            return json_response(
                {"error": "该账户登录尝试过于频繁，请稍后再试"}, 429)

    if not account:
        return json_response({"error": "请输入邮箱或用户名"}, 400)

    conn = get_db()
    user = conn.execute(
        "SELECT * FROM users WHERE email = ? OR LOWER(username) = ?",
        (account, account)).fetchone()

    if not user:
        conn.close()
        return json_response({"error": "邮箱/用户名或密码错误"}, 401)

    email = user['email']

    if not user['is_verified']:
        conn.close()
        return json_response({"error": "请先验证邮箱后再登录"}, 403)

    if not user['is_active']:
        conn.close()
        return json_response({"error": "账户已被禁用"}, 403)

    if password:
        if user['password_hash'] != hash_password(password):
            conn.close()
            return json_response({"error": "邮箱/用户名或密码错误"}, 401)
        conn.close()
    elif code:
        conn.close()
        result = verify_code_with_limit(email, code, 'login')
        if not result['success']:
            return json_response({"error": result['error']}, 400)
    else:
        return json_response({"error": "请提供密码或验证码"}, 400)

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?",
        (user['id'],)).fetchone()
    if user and not user['api_key']:
        new_key = generate_api_key()
        conn.execute("UPDATE users SET api_key = ? WHERE id = ?",
            (new_key, user['id']))
        conn.commit()
        user = conn.execute("SELECT * FROM users WHERE id = ?",
            (user['id'],)).fetchone()
    conn.close()

    total_token_quota = get_total_token_quota(user['id'])
    return json_response({
        "message": "登录成功",
        "user": {
            "id": user['id'],
            "email": user['email'],
            "username": user['username'],
            "role": user['role'],
            "is_verified": bool(user['is_verified']),
            "api_key": user['api_key'],
            "api_key_masked": mask_api_key(user['api_key']),
            "remaining_tokens": user['remaining_tokens'],
            "total_token_quota": total_token_quota
        }
    })


@app.route('/api/auth/login-with-code', methods=['POST'])
def login_with_code():
    client_ip = get_client_ip()
    if not check_rate_limit(f'login_code:{client_ip}',
                            max_requests=5, window_seconds=60):
        return json_response(
            {"error": "操作过于频繁，请稍后再试"}, 429)

    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    code = data.get('code') or ''

    result = verify_code_with_limit(email, code, 'login')
    if not result['success']:
        return json_response({"error": result['error']}, 400)

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email = ?",
        (email,)).fetchone()
    if not user:
        conn.close()
        return json_response({"error": "用户不存在"}, 404)
    if not user['is_active']:
        conn.close()
        return json_response({"error": "账户已被禁用"}, 403)

    user = conn.execute("SELECT * FROM users WHERE email = ?",
        (email,)).fetchone()
    if user and not user['api_key']:
        new_key = generate_api_key()
        conn.execute("UPDATE users SET api_key = ? WHERE id = ?",
            (new_key, user['id']))
        conn.commit()
        user = conn.execute("SELECT * FROM users WHERE email = ?",
            (email,)).fetchone()
    conn.close()

    total_token_quota = get_total_token_quota(user['id'])
    return json_response({
        "message": "登录成功",
        "user": {
            "id": user['id'],
            "email": user['email'],
            "username": user['username'],
            "role": user['role'],
            "is_verified": bool(user['is_verified']),
            "api_key": user['api_key'],
            "api_key_masked": mask_api_key(user['api_key']),
            "remaining_tokens": user['remaining_tokens'],
            "total_token_quota": total_token_quota
        }
    })


@app.route('/api/auth/send-verification', methods=['POST'])
def send_verification():
    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    purpose = (data.get('purpose') or 'register').strip()

    client_ip = get_client_ip()
    rate_key = f'send_verification:{email}:{purpose}'
    if not check_rate_limit(rate_key, max_requests=1, window_seconds=60):
        return json_response(
            {"error": "操作过于频繁，请1分钟后再试"}, 429)
    if not check_rate_limit(f'send_verification_ip:{client_ip}',
                            max_requests=5, window_seconds=300):
        return json_response(
            {"error": "操作过于频繁，请稍后再试"}, 429)
    if not check_rate_limit(f'send_verification_global:{purpose}',
                            max_requests=30, window_seconds=60):
        return json_response(
            {"error": "系统繁忙，请稍后再试"}, 429)

    conn = get_db()
    user = conn.execute("SELECT id FROM users WHERE email = ?",
        (email,)).fetchone()
    if purpose in ('login', 'change_password') and not user:
        conn.close()
        return json_response({"error": "该邮箱未注册"}, 404)
    conn.close()

    conn = get_db()
    conn.execute(
        "DELETE FROM email_verifications WHERE email = ? AND purpose = ? "
        "AND used = 0", (email, purpose))
    conn.commit()
    conn.close()

    code = generate_email_code()
    expires_at = (datetime.now() + timedelta(minutes=5)).strftime(
        '%Y-%m-%d %H:%M:%S')
    conn = get_db()
    conn.execute(
        "INSERT INTO email_verifications (email, code, purpose, expires_at) "
        "VALUES (?, ?, ?, ?)",
        (email, code, purpose, expires_at))
    conn.commit()
    conn.close()

    send_verification_email(email, code, purpose)
    return json_response({"message": "验证码已发送"})


@app.route('/api/auth/verify-email', methods=['POST'])
def verify_email():
    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    code = (data.get('code') or '').strip()
    purpose = (data.get('purpose') or 'register').strip()

    client_ip = get_client_ip()
    if not check_rate_limit(f'verify_email:{email}:{purpose}',
                            max_requests=3, window_seconds=60):
        return json_response(
            {"error": "验证尝试过于频繁，请稍后再试"}, 429)
    if not check_rate_limit(f'verify_email_ip:{client_ip}:{purpose}',
                            max_requests=10, window_seconds=300):
        return json_response(
            {"error": "验证尝试过于频繁，请稍后再试"}, 429)

    result = verify_code_with_limit(email, code, purpose)
    if not result['success']:
        return json_response({"error": result['error']}, 400)

    if purpose == 'register':
        conn = get_db()
        conn.execute("UPDATE users SET is_verified = 1 WHERE email = ?",
            (email,))
        conn.commit()
        user = conn.execute("SELECT * FROM users WHERE email = ?",
            (email,)).fetchone()
        if user and not user['api_key']:
            new_key = generate_api_key()
            conn.execute("UPDATE users SET api_key = ? WHERE id = ?",
                (new_key, user['id']))
            conn.commit()
            user = conn.execute("SELECT * FROM users WHERE email = ?",
                (email,)).fetchone()
        conn.close()
        if user:
            conn = get_db()
            existing_space = conn.execute(
                "SELECT id FROM user_spaces WHERE user_id = ? AND name = '试用'",
                (user['id'],)).fetchone()
            if not existing_space:
                conn.execute(
                    "INSERT INTO user_spaces (user_id, name, description, tokens) "
                    "VALUES (?, '试用', '专属AI试用空间', ?)",
                    (user['id'], user['remaining_tokens']))
                conn.commit()
            conn.close()
            total_token_quota = get_total_token_quota(user['id'])
            return json_response({
                "message": "邮箱验证成功",
                "user": {
                    "id": user['id'],
                    "email": user['email'],
                    "username": user['username'],
                    "role": user['role'],
                    "is_verified": True,
                    "api_key": user['api_key'],
                    "remaining_tokens": user['remaining_tokens'],
                    "total_token_quota": total_token_quota
                }
            })
        return json_response({"message": "邮箱验证成功"})

    return json_response({"message": "验证成功"})


@app.route('/api/auth/change-password-send-code', methods=['POST'])
@require_auth
def change_password_send_code():
    user = request.current_user
    email = user['email']

    if not check_rate_limit(f'change_pwd_code:{email}',
                            max_requests=1, window_seconds=60):
        return json_response(
            {"error": "操作过于频繁，请1分钟后再试"}, 429)

    conn = get_db()
    conn.execute(
        "DELETE FROM email_verifications WHERE email = ? AND purpose = ? "
        "AND used = 0", (email, 'change_password'))
    conn.commit()
    conn.close()

    code = generate_email_code()
    expires_at = (datetime.now() + timedelta(minutes=5)).strftime(
        '%Y-%m-%d %H:%M:%S')
    conn = get_db()
    conn.execute(
        "INSERT INTO email_verifications (email, code, purpose, expires_at) "
        "VALUES (?, ?, 'change_password', ?)",
        (email, code, expires_at))
    conn.commit()
    conn.close()

    send_verification_email(email, code, 'change_password')
    return json_response({"message": "验证码已发送到您的邮箱"})


@app.route('/api/auth/change-password', methods=['POST'])
@require_auth
def change_password():
    user = request.current_user
    data = request.get_json()
    code = (data.get('code') or '').strip()
    new_password = data.get('new_password') or ''
    confirm_password = data.get('confirm_password') or ''

    if not code:
        return json_response({"error": "请输入验证码"}, 400)
    if len(new_password) < 8:
        return json_response({"error": "新密码至少8位"}, 400)
    valid, msg = validate_password_strength(new_password)
    if not valid:
        return json_response({"error": msg}, 400)
    if new_password != confirm_password:
        return json_response({"error": "两次输入的密码不一致"}, 400)

    result = verify_code_with_limit(user['email'], code, 'change_password')
    if not result['success']:
        return json_response({"error": result['error']}, 400)

    conn = get_db()
    conn.execute(
        "UPDATE users SET password_hash = ?, updated_at = datetime('now') "
        "WHERE id = ?",
        (hash_password(new_password), user['id']))
    conn.commit()
    conn.close()

    return json_response({"message": "密码修改成功"})


@app.route('/api/user/regenerate-api-key', methods=['POST'])
@require_auth
def regenerate_api_key():
    user = request.current_user
    client_ip = get_client_ip()
    if not check_rate_limit(f'regenerate_key:{user["id"]}',
                            max_requests=2, window_seconds=300, user=user):
        return json_response(
            {"error": "操作过于频繁，每5分钟最多可重新生成2次"}, 429)
    if not check_rate_limit(f'regenerate_key_ip:{client_ip}',
                            max_requests=5, window_seconds=300):
        return json_response(
            {"error": "操作过于频繁，请稍后再试"}, 429)
    new_api_key = generate_api_key()
    conn = get_db()
    conn.execute(
        "UPDATE users SET api_key = ?, updated_at = datetime('now') "
        "WHERE id = ?", (new_api_key, user['id']))
    conn.commit()
    conn.close()

    dynamic_token = generate_dynamic_token(user['id'])
    return json_response({
        "api_key": new_api_key,
        "dynamic_token": dynamic_token,
        "message": "API Key已重新生成"
    })




@app.route('/api/user/usage-history', methods=['GET'])
@require_auth
def user_usage_history():
    user = request.current_user
    days = request.args.get('days', 14, type=int)
    days = max(1, min(90, days))

    conn = get_db()
    rows = conn.execute(
        "SELECT date(created_at) as day, "
        "SUM(COALESCE(prompt_tokens,0)) as prompt_tokens, "
        "SUM(COALESCE(completion_tokens,0)) as completion_tokens, "
        "SUM(COALESCE(prompt_tokens,0) + COALESCE(completion_tokens,0)) as total_tokens, "
        "COUNT(*) as call_count "
        "FROM api_usage_log "
        "WHERE user_id = ? AND created_at >= datetime('now', ? || ' days') "
        "GROUP BY date(created_at) "
        "ORDER BY day",
        (user['id'], f'-{days}'))
    history = [dict(r) for r in rows]
    conn.close()

    conn = get_db()
    today = conn.execute(
        "SELECT SUM(COALESCE(prompt_tokens,0) + COALESCE(completion_tokens,0)) as total "
        "FROM api_usage_log "
        "WHERE user_id = ? AND date(created_at) = date('now')",
        (user['id'],)).fetchone()
    conn.close()

    return json_response({
        "history": history,
        "today_usage": {"total": today['total']} if today and today['total'] is not None else {"total": 0}
    })


def get_total_token_quota(user_id: int) -> int:
    conn = get_db()
    total_used = conn.execute(
        "SELECT SUM(COALESCE(prompt_tokens,0) + COALESCE(completion_tokens,0)) as total "
        "FROM api_usage_log WHERE user_id = ?",
        (user_id,)).fetchone()
    remaining = conn.execute(
        "SELECT remaining_tokens FROM users WHERE id = ?",
        (user_id,)).fetchone()
    conn.close()
    used = total_used['total'] if total_used and total_used['total'] is not None else 0
    rem = remaining['remaining_tokens'] if remaining else 0
    return used + rem


@app.route('/api/user/profile', methods=['GET'])
@require_auth
def get_profile():
    user = request.current_user
    if not check_rate_limit(f'profile:{user["id"]}',
                            max_requests=30, window_seconds=60, user=user):
        return json_response(
            {"error": "操作过于频繁，请稍后再试"}, 429)
    dynamic_token = generate_dynamic_token(user['id'])
    total_token_quota = get_total_token_quota(user['id'])
    return json_response({
        "user": {
            "id": user['id'],
            "email": user['email'],
            "username": user['username'],
            "role": user['role'],
            "is_verified": bool(user['is_verified']),
            "api_key": user['api_key'],
            "api_key_masked": mask_api_key(user['api_key']) if user.get('api_key') else None,
            "dynamic_token": dynamic_token,
            "remaining_tokens": user['remaining_tokens'],
            "total_token_quota": total_token_quota,
            "max_concurrent": user['max_concurrent'],
            "priority": user['priority']
        }
    })


@app.route('/api/user/username', methods=['PUT'])
@require_auth
def update_username():
    user = request.current_user
    data = request.get_json()
    new_username = (data.get('username') or '').strip()

    if not new_username:
        return json_response({"error": "请输入用户名"}, 400)
    if not re.match(r'^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$', new_username):
        return json_response({"error": "用户名格式不正确（2-20位，支持中英文、数字和下划线）"}, 400)

    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM users WHERE LOWER(username) = ? AND id != ?",
        (new_username.lower(), user['id'])).fetchone()
    if existing:
        conn.close()
        return json_response({"error": "该用户名已被使用"}, 409)

    conn.execute(
        "UPDATE users SET username = ?, updated_at = datetime('now') "
        "WHERE id = ?", (new_username, user['id']))
    conn.commit()
    conn.close()

    return json_response({"message": "用户名已更新", "username": new_username})


@app.route('/api/user/dynamic-token', methods=['POST'])
@require_auth
def get_dynamic_token():
    user = request.current_user
    token = generate_dynamic_token(user['id'],
        request.get_json().get('permissions', 'read') if request.get_json()
        else 'read')
    return json_response({"dynamic_token": token, "expires_in": 3600})


# ==================== 用户空间管理 ====================

@app.route('/api/spaces', methods=['GET'])
@require_auth
def list_spaces():
    user = request.current_user
    conn = get_db()
    spaces = conn.execute(
        "SELECT id, user_id, name, description, tokens, is_active, created_at, updated_at, "
        "(SELECT COUNT(*) FROM space_contexts WHERE space_id = user_spaces.id) as context_count "
        "FROM user_spaces WHERE user_id = ? ORDER BY updated_at DESC",
        (user['id'],)).fetchall()
    conn.close()
    return json_response({"spaces": [dict(s) for s in spaces]})


@app.route('/api/spaces', methods=['POST'])
@require_auth
def create_space():
    user = request.current_user
    data = request.get_json()
    name = (data.get('name') or '').strip()
    description = (data.get('description') or '').strip()

    if not name:
        return json_response({"error": "请输入空间名称"}, 400)
    if len(name) > 50:
        return json_response({"error": "空间名称不能超过50个字符"}, 400)
    if len(description) > 500:
        return json_response({"error": "空间描述不能超过500个字符"}, 400)

    conn = get_db()
    count = conn.execute(
        "SELECT COUNT(*) as c FROM user_spaces WHERE user_id = ?",
        (user['id'],)).fetchone()['c']
    if count >= 50:
        conn.close()
        return json_response({"error": "每个用户最多创建50个空间"}, 400)

    conn.execute(
        "INSERT INTO user_spaces (user_id, name, description) VALUES (?, ?, ?)",
        (user['id'], name, description))
    conn.commit()
    space_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    space = conn.execute(
        "SELECT id, user_id, name, description, tokens, is_active, created_at, updated_at "
        "FROM user_spaces WHERE id = ?", (space_id,)).fetchone()
    conn.close()

    return json_response({"space": dict(space), "message": "空间创建成功"})


@app.route('/api/spaces/<int:space_id>', methods=['GET'])
@require_auth
def get_space(space_id):
    user = request.current_user
    conn = get_db()
    space = conn.execute(
        "SELECT id, user_id, name, description, tokens, is_active, created_at, updated_at, "
        "(SELECT COUNT(*) FROM space_contexts WHERE space_id = user_spaces.id) as context_count "
        "FROM user_spaces WHERE id = ? AND user_id = ?",
        (space_id, user['id'])).fetchone()
    conn.close()
    if not space:
        return json_response({"error": "空间不存在"}, 404)
    return json_response({"space": dict(space)})


@app.route('/api/spaces/<int:space_id>', methods=['PUT'])
@require_auth
def update_space(space_id):
    user = request.current_user
    data = request.get_json()
    name = (data.get('name') or '').strip()
    description = data.get('description')

    if not name:
        return json_response({"error": "请输入空间名称"}, 400)
    if len(name) > 50:
        return json_response({"error": "空间名称不能超过50个字符"}, 400)

    conn = get_db()
    space = conn.execute(
        "SELECT * FROM user_spaces WHERE id = ? AND user_id = ?",
        (space_id, user['id'])).fetchone()
    if not space:
        conn.close()
        return json_response({"error": "空间不存在"}, 404)

    updates = ["name = ?", "updated_at = datetime('now')"]
    params = [name]
    if description is not None:
        description = description.strip()
        if len(description) > 500:
            conn.close()
            return json_response({"error": "空间描述不能超过500个字符"}, 400)
        updates.append("description = ?")
        params.append(description)

    params.append(space_id)
    conn.execute(
        f"UPDATE user_spaces SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    space = conn.execute(
        "SELECT id, user_id, name, description, tokens, is_active, created_at, updated_at "
        "FROM user_spaces WHERE id = ?", (space_id,)).fetchone()
    conn.close()
    return json_response({"space": dict(space), "message": "空间已更新"})


@app.route('/api/spaces/<int:space_id>', methods=['DELETE'])
@require_auth
def delete_space(space_id):
    user = request.current_user
    conn = get_db()
    space = conn.execute(
        "SELECT * FROM user_spaces WHERE id = ? AND user_id = ?",
        (space_id, user['id'])).fetchone()
    if not space:
        conn.close()
        return json_response({"error": "空间不存在"}, 404)
    conn.execute("DELETE FROM space_contexts WHERE space_id = ?", (space_id,))
    conn.execute("DELETE FROM user_spaces WHERE id = ?", (space_id,))
    conn.commit()
    conn.close()

    return json_response({"message": "空间已删除"})


# ==================== 空间上下文管理 ====================

@app.route('/api/spaces/<int:space_id>/contexts', methods=['GET'])
@require_auth
def list_contexts(space_id):
    user = request.current_user
    limit = request.args.get('limit', 50, type=int)
    limit = max(1, min(200, limit))
    room_id = request.args.get('room_id')

    conn = get_db()
    # If room_id provided, prefer room-based contexts (room_id is a string key, isolated)
    if room_id:
        # only return contexts created within last 7 days
        seven_days_ago = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')
        contexts = conn.execute(
            "SELECT id, NULL as space_id, user_id, role, content, token_count, created_at, room_id "
            "FROM space_contexts WHERE room_id = ? AND created_at >= ? ORDER BY id ASC",
            (room_id, seven_days_ago)).fetchall()
    else:
        space = conn.execute(
            "SELECT id FROM user_spaces WHERE id = ? AND user_id = ?",
            (space_id, user['id'])).fetchone()
        if not space:
            conn.close()
            return json_response({"error": "空间不存在"}, 404)

        contexts = conn.execute(
            "SELECT id, space_id, user_id, role, content, token_count, created_at, room_id "
            "FROM space_contexts WHERE space_id = ? ORDER BY id ASC",
            (space_id,)).fetchall()
    conn.close()

    messages = [dict(c) for c in contexts]
    if len(messages) > limit:
        messages = messages[-limit:]

    total_tokens = sum(m.get('token_count', 0) for m in messages)

    return json_response({
        "contexts": messages,
        "total_count": len(contexts),
        "returned_count": len(messages),
        "total_tokens": total_tokens
    })


@app.route('/api/spaces/<int:space_id>/contexts', methods=['POST'])
@require_auth
def add_context(space_id):
    user = request.current_user
    data = request.get_json()
    role = data.get('role', 'user')
    content = (data.get('content') or '').strip()
    room_id = data.get('room_id')

    if role not in ('user', 'assistant', 'system'):
        return json_response({"error": "角色无效，必须是 user/assistant/system"}, 400)
    if not content:
        return json_response({"error": "内容不能为空"}, 400)
    if len(content) > 50000:
        return json_response({"error": "内容过长，最多50000字符"}, 400)

    conn = get_db()
    # If room_id is provided, bypass space ownership check and store as room context
    if room_id:
        token_count = calculate_tokens(content)
        conn.execute(
            "INSERT INTO space_contexts (space_id, user_id, role, content, token_count, room_id) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (0, user['id'], role, content, token_count, room_id))
    else:
        space = conn.execute(
            "SELECT id FROM user_spaces WHERE id = ? AND user_id = ?",
            (space_id, user['id'])).fetchone()
        if not space:
            conn.close()
            return json_response({"error": "空间不存在"}, 404)

        token_count = calculate_tokens(content)
        conn.execute(
            "INSERT INTO space_contexts (space_id, user_id, role, content, token_count) "
            "VALUES (?, ?, ?, ?, ?)",
            (space_id, user['id'], role, content, token_count))
    conn.commit()
    ctx_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    ctx = conn.execute(
        "SELECT id, space_id, user_id, role, content, token_count, created_at, room_id "
        "FROM space_contexts WHERE id = ?", (ctx_id,)).fetchone()
    conn.close()

    return json_response({"context": dict(ctx), "message": "上下文已添加"})


@app.route('/api/spaces/<int:space_id>/contexts/batch', methods=['POST'])
@require_auth
def batch_add_contexts(space_id):
    user = request.current_user
    data = request.get_json()
    messages = data.get('messages', [])

    if not messages or not isinstance(messages, list):
        return json_response({"error": "请提供messages数组"}, 400)
    if len(messages) > 100:
        return json_response({"error": "单次最多批量添加100条消息"}, 400)

    conn = get_db()
    space = conn.execute(
        "SELECT id FROM user_spaces WHERE id = ? AND user_id = ?",
        (space_id, user['id'])).fetchone()
    if not space:
        conn.close()
        return json_response({"error": "空间不存在"}, 404)

    added = []
    for msg in messages:
        role = msg.get('role', 'user')
        content = (msg.get('content') or '').strip()
        msg_room_id = msg.get('room_id')
        if role not in ('user', 'assistant', 'system') or not content:
            continue
        if len(content) > 50000:
            continue
        token_count = calculate_tokens(content)
        if msg_room_id:
            conn.execute(
                "INSERT INTO space_contexts (space_id, user_id, role, content, token_count, room_id) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (0, user['id'], role, content, token_count, msg_room_id))
        else:
            conn.execute(
                "INSERT INTO space_contexts (space_id, user_id, role, content, token_count) "
                "VALUES (?, ?, ?, ?, ?)",
                (space_id, user['id'], role, content, token_count))
        conn.commit()
        ctx_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        ctx = conn.execute(
            "SELECT id, space_id, user_id, role, content, token_count, created_at, room_id "
            "FROM space_contexts WHERE id = ?", (ctx_id,)).fetchone()
        added.append(dict(ctx))

    conn.close()
    return json_response({"contexts": added, "count": len(added), "message": f"已添加{len(added)}条上下文"})


@app.route('/api/spaces/<int:space_id>/contexts/<int:context_id>', methods=['DELETE'])
@require_auth
def delete_context(space_id, context_id):
    user = request.current_user
    conn = get_db()
    space = conn.execute(
        "SELECT id FROM user_spaces WHERE id = ? AND user_id = ?",
        (space_id, user['id'])).fetchone()
    if not space:
        conn.close()
        return json_response({"error": "空间不存在"}, 404)

    ctx = conn.execute(
        "SELECT id FROM space_contexts WHERE id = ? AND space_id = ?",
        (context_id, space_id)).fetchone()
    if not ctx:
        conn.close()
        return json_response({"error": "上下文不存在"}, 404)

    conn.execute("DELETE FROM space_contexts WHERE id = ?", (context_id,))
    conn.commit()
    conn.close()
    return json_response({"message": "上下文已删除"})


@app.route('/api/spaces/<int:space_id>/contexts', methods=['DELETE'])
@require_auth
def clear_contexts(space_id):
    user = request.current_user
    conn = get_db()
    space = conn.execute(
        "SELECT id FROM user_spaces WHERE id = ? AND user_id = ?",
        (space_id, user['id'])).fetchone()
    if not space:
        conn.close()
        return json_response({"error": "空间不存在"}, 404)

    conn.execute("DELETE FROM space_contexts WHERE space_id = ?", (space_id,))
    conn.commit()
    conn.close()
    return json_response({"message": "上下文已清空"})


@app.route('/api/spaces/<int:space_id>/contexts/settings', methods=['GET'])
@require_auth
def get_context_settings(space_id):
    user = request.current_user
    conn = get_db()
    space = conn.execute(
        "SELECT id FROM user_spaces WHERE id = ? AND user_id = ?",
        (space_id, user['id'])).fetchone()
    if not space:
        conn.close()
        return json_response({"error": "空间不存在"}, 404)

    settings = conn.execute(
        "SELECT * FROM user_context_settings WHERE user_id = ?",
        (user['id'],)).fetchone()
    if not settings:
        conn.execute(
            "INSERT INTO user_context_settings (user_id) VALUES (?)",
            (user['id'],))
        conn.commit()
        settings = conn.execute(
            "SELECT * FROM user_context_settings WHERE user_id = ?",
            (user['id'],)).fetchone()
    conn.close()
    return json_response({"settings": dict(settings)})


@app.route('/api/spaces/<int:space_id>/contexts/settings', methods=['PUT'])
@require_auth
def update_context_settings(space_id):
    user = request.current_user
    data = request.get_json()

    conn = get_db()
    space = conn.execute(
        "SELECT id FROM user_spaces WHERE id = ? AND user_id = ?",
        (space_id, user['id'])).fetchone()
    if not space:
        conn.close()
        return json_response({"error": "空间不存在"}, 404)

    max_context_messages = data.get('max_context_messages')
    max_context_tokens = data.get('max_context_tokens')
    auto_summary = data.get('auto_summary')
    summary_model = data.get('summary_model')

    updates = ["updated_at = datetime('now')"]
    params = []

    if max_context_messages is not None:
        max_context_messages = int(max_context_messages)
        if max_context_messages < 1 or max_context_messages > 200:
            conn.close()
            return json_response({"error": "上下文消息数必须在1-200之间"}, 400)
        updates.append("max_context_messages = ?")
        params.append(max_context_messages)

    if max_context_tokens is not None:
        max_context_tokens = int(max_context_tokens)
        if max_context_tokens < 100 or max_context_tokens > 32000:
            conn.close()
            return json_response({"error": "上下文Token数必须在100-32000之间"}, 400)
        updates.append("max_context_tokens = ?")
        params.append(max_context_tokens)

    if auto_summary is not None:
        updates.append("auto_summary = ?")
        params.append(1 if auto_summary else 0)

    if summary_model is not None:
        updates.append("summary_model = ?")
        params.append(str(summary_model).strip())

    if params:
        existing = conn.execute(
            "SELECT id FROM user_context_settings WHERE user_id = ?",
            (user['id'],)).fetchone()
        if existing:
            params.append(user['id'])
            conn.execute(
                f"UPDATE user_context_settings SET {', '.join(updates)} WHERE user_id = ?",
                params)
        else:
            field_names = [u.split(' = ')[0] for u in updates if u != "updated_at = datetime('now')"]
            placeholders = ['?'] * len(field_names)
            conn.execute(
                f"INSERT INTO user_context_settings (user_id, {', '.join(field_names)}) "
                f"VALUES (?, {', '.join(placeholders)})",
                [user['id']] + params)
        conn.commit()

    settings = conn.execute(
        "SELECT * FROM user_context_settings WHERE user_id = ?",
        (user['id'],)).fetchone()
    if not settings:
        conn.execute("INSERT INTO user_context_settings (user_id) VALUES (?)", (user['id'],))
        conn.commit()
        settings = conn.execute(
            "SELECT * FROM user_context_settings WHERE user_id = ?",
            (user['id'],)).fetchone()
    conn.close()
    return json_response({"settings": dict(settings), "message": "设置已更新"})


# ==================== 管理员路由 ====================

@app.route('/api/admin/users', methods=['GET'])
@require_admin
def admin_users():
    search = request.args.get('search', '').strip().lower()
    conn = get_db()
    if search:
        users = conn.execute(
            "SELECT id, email, username, role, is_verified, is_active, "
            "created_at, remaining_tokens, max_concurrent, priority "
            "FROM users WHERE LOWER(email) LIKE ? OR LOWER(username) LIKE ? "
            "ORDER BY id",
            (f'%{search}%', f'%{search}%')).fetchall()
    else:
        users = conn.execute(
            "SELECT id, email, username, role, is_verified, is_active, "
            "created_at, remaining_tokens, max_concurrent, priority "
            "FROM users ORDER BY id").fetchall()
    conn.close()
    return json_response({"users": [dict(u) for u in users]})


@app.route('/api/admin/users/<int:user_id>/toggle-status',
           methods=['POST'])
@require_admin
def toggle_user_status(user_id):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?",
        (user_id,)).fetchone()
    if not user:
        conn.close()
        return json_response({"error": "用户不存在"}, 404)
    new_status = 0 if user['is_active'] else 1
    conn.execute(
        "UPDATE users SET is_active = ?, updated_at = datetime('now') "
        "WHERE id = ?", (new_status, user_id))
    conn.commit()
    conn.close()
    log_admin_action(request.current_user, 'toggle_user_status',
        'user', user_id,
        f"用户 {user['username']} (ID:{user_id}) 状态 {'启用' if new_status else '禁用'}")
    return json_response({"message": "状态已更新",
        "is_active": bool(new_status)})


@app.route('/api/admin/users/<int:user_id>/config', methods=['GET'])
@require_admin
def get_user_config(user_id):
    conn = get_db()
    user = conn.execute(
        "SELECT id, email, username, remaining_tokens, max_concurrent, "
        "priority FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if not user:
        return json_response({"error": "用户不存在"}, 404)
    return json_response(dict(user))


@app.route('/api/admin/users/<int:user_id>/config', methods=['PUT'])
@require_admin
def update_user_config(user_id):
    data = request.get_json()
    remaining_tokens = data.get('remaining_tokens')
    max_concurrent = data.get('max_concurrent')
    priority = data.get('priority')

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?",
        (user_id,)).fetchone()
    if not user:
        conn.close()
        return json_response({"error": "用户不存在"}, 404)

    updates = []
    params = []

    if remaining_tokens is not None:
        if remaining_tokens < 0:
            conn.close()
            return json_response({"error": "剩余Token不能为负数"}, 400)
        updates.append("remaining_tokens = ?")
        params.append(remaining_tokens)

    if max_concurrent is not None:
        if max_concurrent < 1 or max_concurrent > 100:
            conn.close()
            return json_response(
                {"error": "最大并发数必须在1-100之间"}, 400)
        updates.append("max_concurrent = ?")
        params.append(max_concurrent)

    if priority is not None:
        if priority < 0 or priority > 5:
            conn.close()
            return json_response(
                {"error": "优先级必须在0-5之间"}, 400)
        updates.append("priority = ?")
        params.append(priority)

    if updates:
        params.append(user_id)
        conn.execute(
            f"UPDATE users SET {', '.join(updates)}, "
            f"updated_at = datetime('now') WHERE id = ?", params)
        conn.commit()

    user = conn.execute(
        "SELECT id, email, username, remaining_tokens, max_concurrent, "
        "priority FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    log_admin_action(request.current_user, 'update_user_config',
        'user', user_id,
        f"更新用户配置 (ID:{user_id})")
    return json_response(dict(user))


@app.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@require_admin
def update_user_full(user_id):
    data = request.get_json()
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?",
        (user_id,)).fetchone()
    if not user:
        conn.close()
        return json_response({"error": "用户不存在"}, 404)

    updates = []
    params = []

    email = data.get('email')
    if email is not None:
        email = email.strip().lower()
        if email and re.match(r'^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$', email):
            existing = conn.execute(
                "SELECT id FROM users WHERE email = ? AND id != ?",
                (email, user_id)).fetchone()
            if existing:
                conn.close()
                return json_response({"error": "该邮箱已被使用"}, 409)
            updates.append("email = ?")
            params.append(email)

    username = data.get('username')
    if username is not None:
        username = username.strip()
        if username:
            updates.append("username = ?")
            params.append(username)

    remaining_tokens = data.get('remaining_tokens')
    if remaining_tokens is not None:
        if remaining_tokens < 0:
            conn.close()
            return json_response({"error": "剩余Token不能为负数"}, 400)
        updates.append("remaining_tokens = ?")
        params.append(remaining_tokens)

    max_concurrent = data.get('max_concurrent')
    if max_concurrent is not None:
        if max_concurrent < 1 or max_concurrent > 100:
            conn.close()
            return json_response(
                {"error": "最大并发数必须在1-100之间"}, 400)
        updates.append("max_concurrent = ?")
        params.append(max_concurrent)

    priority = data.get('priority')
    if priority is not None:
        if priority < 0 or priority > 5:
            conn.close()
            return json_response(
                {"error": "优先级必须在0-5之间"}, 400)
        updates.append("priority = ?")
        params.append(priority)

    if updates:
        params.append(user_id)
        conn.execute(
            f"UPDATE users SET {', '.join(updates)}, "
            f"updated_at = datetime('now') WHERE id = ?", params)
        conn.commit()

    user = conn.execute(
        "SELECT id, email, username, role, is_verified, is_active, "
        "remaining_tokens, max_concurrent, priority FROM users "
        "WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    log_admin_action(request.current_user, 'update_user_full',
        'user', user_id,
        f"更新用户 {user['username']} (ID:{user_id})")
    return json_response(dict(user))


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@require_admin
def admin_delete_user(user_id):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?",
        (user_id,)).fetchone()
    if not user:
        conn.close()
        return json_response({"error": "用户不存在"}, 404)
    if user['role'] == 'admin':
        conn.close()
        return json_response({"error": "不能删除管理员账户"}, 400)
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    log_admin_action(request.current_user, 'delete_user',
        'user', user_id,
        f"删除用户 {user['username']} (邮箱:{user['email']})")
    return json_response({"message": "用户已删除"})


@app.route('/api/admin/token-config', methods=['GET'])
@require_admin
def get_token_config():
    conn = get_db()
    cfg = conn.execute(
        "SELECT * FROM token_config ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    if not cfg:
        return json_response(
            {"chinese_ratio": 2.0, "english_ratio": 4.0, "other_ratio": 2.0})
    return json_response(dict(cfg))


@app.route('/api/admin/token-config', methods=['PUT'])
@require_admin
def update_token_config():
    data = request.get_json()
    chinese_ratio = float(data.get('chinese_ratio', 2.0))
    english_ratio = float(data.get('english_ratio', 4.0))
    other_ratio = float(data.get('other_ratio', 2.0))

    if chinese_ratio <= 0 or english_ratio <= 0 or other_ratio <= 0:
        return json_response({"error": "比率必须大于0"}, 400)

    conn = get_db()
    conn.execute(
        "UPDATE token_config SET chinese_ratio = ?, english_ratio = ?, "
        "other_ratio = ?, updated_by = ?, updated_at = datetime('now')",
        (chinese_ratio, english_ratio, other_ratio,
         request.current_user['id']))
    conn.commit()
    cfg = conn.execute(
        "SELECT * FROM token_config ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    log_admin_action(request.current_user, 'update_token_config',
        'config', 0,
        f"中文比率:{chinese_ratio}, 英文比率:{english_ratio}, 其他比率:{other_ratio}")
    return json_response(dict(cfg))


@app.route('/api/admin/update-user-data', methods=['PUT'])
@require_admin
def admin_update_user_data():
    data = request.get_json()
    user_id = data.get('user_id')
    if not user_id:
        return json_response({"error": "请指定用户ID"}, 400)

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?",
        (user_id,)).fetchone()
    if not user:
        conn.close()
        return json_response({"error": "用户不存在"}, 404)

    fields = ['email', 'username', 'remaining_tokens', 'max_concurrent',
              'priority', 'is_active', 'is_verified']
    updates = []
    params = []

    for field in fields:
        if field in data:
            val = data[field]
            if field == 'email':
                val = str(val).strip().lower()
                if val and re.match(
                        r'^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$', val):
                    existing = conn.execute(
                        "SELECT id FROM users WHERE email = ? AND id != ?",
                        (val, user_id)).fetchone()
                    if existing:
                        conn.close()
                        return json_response(
                            {"error": "该邮箱已被使用"}, 409)
                else:
                    continue
            updates.append(f"{field} = ?")
            params.append(val)

    if updates:
        params.append(user_id)
        conn.execute(
            f"UPDATE users SET {', '.join(updates)}, "
            f"updated_at = datetime('now') WHERE id = ?", params)
        conn.commit()

    user = conn.execute(
        "SELECT id, email, username, role, is_verified, is_active, "
        "remaining_tokens, max_concurrent, priority FROM users "
        "WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    log_admin_action(request.current_user, 'update_user_data',
        'user', user_id,
        f"批量更新用户数据 (ID:{user_id})")
    return json_response(dict(user))


def send_notification_email(to_email: str, subject: str, body: str,
                            ntype: str = 'announcement',
                            token_amount: int = 0) -> bool:
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        template_name = 'token_grant.html' if ntype == 'token_grant' else 'notification.html'
        template_path = os.path.join(base_dir, template_name)

        if os.path.exists(template_path):
            with open(template_path, 'r', encoding='utf-8') as f:
                html_body = f.read()
                html_body = html_body.replace('{{SUBJECT}}', subject)
                html_body = html_body.replace('{{BODY}}', body.replace('\n', '<br>'))
                if ntype == 'token_grant':
                    html_body = html_body.replace('{{TOKEN_AMOUNT}}', str(token_amount))
        else:
            html_body = (
                f'<div style="font-family:sans-serif;padding:24px;">'
                f'<h2 style="color:#1e293b;">{subject}</h2>'
                f'<div style="color:#475569;line-height:1.7;white-space:pre-wrap;">{body}</div>'
                f'<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">'
                f'<p style="color:#94a3b8;font-size:12px;">DingDang Cloud 团队</p>'
                f'</div>')
        msg = email.mime.text.MIMEText(html_body, 'html', 'utf-8')
        msg['Subject'] = subject
        sender_display = SMTP_CONFIG['display_name'] or 'DingDang Cloud'
        sender_email = SMTP_CONFIG['sender_email'] or 'noreply@dingdang.cloud'
        msg['From'] = f"{sender_display} <{sender_email}>"
        msg['To'] = to_email

        is_dev_mode = (not SMTP_CONFIG['password'] or
                        'change_me' in str(SMTP_CONFIG['password']).lower() or
                        'company.com' in str(SMTP_CONFIG['server']).lower())

        if is_dev_mode:
            logger.info(f"[DEV] 通知邮件发送给 {to_email}: {subject}")
            logger.warning("SMTP未正确配置，使用开发模式（通知邮件将记录在日志中）")
            return True

        if SMTP_CONFIG['encryption'] == 'SSL':
            with smtplib.SMTP_SSL(SMTP_CONFIG['server'],
                                  SMTP_CONFIG['port'], timeout=10) as server:
                server.login(SMTP_CONFIG['username'],
                             SMTP_CONFIG['password'])
                server.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_CONFIG['server'],
                              SMTP_CONFIG['port']) as server:
                server.starttls()
                server.login(SMTP_CONFIG['username'],
                             SMTP_CONFIG['password'])
                server.send_message(msg)

        logger.info(f"通知邮件已发送到 {to_email}")
        return True
    except Exception as e:
        logger.error(f"发送通知邮件失败: {str(e)}")
        return False


def resolve_user_target(identifier, conn):
    try:
        uid = int(identifier)
        user = conn.execute(
            "SELECT id, email, username, is_verified FROM users WHERE id = ?",
            (uid,)).fetchone()
        if user:
            return user
    except (ValueError, TypeError):
        pass
    ident = identifier.strip().lower()
    user = conn.execute(
        "SELECT id, email, username, is_verified FROM users "
        "WHERE email = ? OR LOWER(username) = ?",
        (ident, ident)).fetchone()
    return user


def polish_with_ai(text: str, style: str = 'formal') -> str:
    if not ADAPTER:
        return text
    try:
        style_prompt = {
            'formal': '请将以下内容润色为正式、专业的风格，保持原意不变，仅返回润色后的结果：\n',
            'concise': '请将以下内容润色为简洁、精炼的风格，保持原意不变，仅返回润色后的结果：\n',
            'friendly': '请将以下内容润色为亲切、友好的风格，保持原意不变，仅返回润色后的结果：\n',
        }
        prefix = style_prompt.get(style, style_prompt['formal'])
        response = ADAPTER.process_prompt(prefix + text, "qwen", 500, 0.7)
        if "error" not in response and response.get("choices"):
            result = response["choices"][0]["text"].strip()
            return result if result else text
        return text
    except Exception:
        return text


@app.route('/api/admin/polish-text', methods=['POST'])
@require_admin
def admin_polish_text():
    data = request.get_json()
    subject = (data.get('subject') or '').strip()
    body = (data.get('body') or '').strip()
    style = (data.get('style') or 'formal').strip()

    result = {}
    if subject:
        result['subject'] = polish_with_ai(subject, style)
    if body:
        result['body'] = polish_with_ai(body, style)
    if not subject and not body:
        return json_response({"error": "请提供需要润色的内容"}, 400)

    return json_response(result)


def parse_batch_targets(target_list, conn):
    target_list = target_list.strip()
    if not target_list:
        return "请输入目标用户列表"

    json_lines = [l.strip() for l in target_list.split('\n') if l.strip()]
    has_json = any(l.startswith('{') for l in json_lines)

    if has_json:
        users = []
        errors = []
        for i, line in enumerate(json_lines):
            try:
                item = json.loads(line)
                ident = item.get('e', '').strip()
                grant_amount = int(item.get('token', 0))
                if not ident or grant_amount <= 0:
                    errors.append(f"第{i+1}行: 邮箱/用户名或token数量无效")
                    continue
                user = resolve_user_target(ident, conn)
                if not user:
                    errors.append(f"第{i+1}行: 用户 '{ident}' 不存在")
                    continue
                user_dict = dict(user)
                user_dict['grant_amount'] = grant_amount
                users.append(user_dict)
            except (json.JSONDecodeError, ValueError, TypeError):
                errors.append(f"第{i+1}行: JSON格式错误")
        if errors and not users:
            return '\n'.join(errors)
        return users
    else:
        parts = []
        for line in json_lines:
            for part in line.replace(',', '\n').split('\n'):
                p = part.strip()
                if p:
                    parts.append(p)
        if not parts:
            return "未找到有效的邮箱或用户名"
        users = []
        errors = []
        seen = set()
        for ident in parts:
            if ident in seen:
                continue
            seen.add(ident)
            user = resolve_user_target(ident, conn)
            if not user:
                errors.append(f"用户 '{ident}' 不存在")
                continue
            users.append(dict(user))
        if errors and not users:
            return '\n'.join(errors)
        return users


@app.route('/api/admin/notifications', methods=['POST'])
@require_admin
def admin_send_notification():
    data = request.get_json()
    subject = (data.get('subject') or '').strip()
    body = (data.get('body') or '').strip()
    ntype = data.get('type', 'announcement')
    token_amount = int(data.get('token_amount', 0))
    target_type = data.get('target_type', 'all')
    target_user_id = data.get('target_user_id')
    target_list = data.get('target_list', '')

    if not subject:
        return json_response({"error": "请输入通知主题"}, 400)
    if not body:
        return json_response({"error": "请输入通知内容"}, 400)
    if ntype not in ('announcement', 'token_grant'):
        return json_response({"error": "通知类型无效"}, 400)
    if ntype == 'token_grant' and token_amount <= 0:
        return json_response({"error": "Token数量必须大于0"}, 400)

    admin = request.current_user
    conn = get_db()

    target_users = []
    if target_type == 'all':
        target_users = conn.execute(
            "SELECT id, email, username, is_verified FROM users WHERE is_active = 1"
        ).fetchall()
    elif target_type == 'single' and target_user_id:
        target_user = resolve_user_target(str(target_user_id), conn)
        if not target_user:
            conn.close()
            return json_response({"error": "目标用户不存在"}, 404)
        target_users = [target_user]
    elif target_type == 'batch' and target_list:
        batch_users = parse_batch_targets(target_list, conn)
        if isinstance(batch_users, str):
            conn.close()
            return json_response({"error": batch_users}, 400)
        target_users = batch_users
    else:
        conn.close()
        return json_response({"error": "请指定目标用户"}, 400)

    conn.execute(
        "INSERT INTO admin_notifications (admin_id, subject, body, type, token_amount, "
        "target_type, target_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (admin['id'], subject, body, ntype, token_amount,
         target_type, target_user_id if target_type == 'single' else None))
    conn.commit()
    notification_id = conn.execute(
        "SELECT last_insert_rowid()").fetchone()[0]

    sent_count = 0
    for u in target_users:
        grant_amount = token_amount
        if isinstance(u, dict) and 'grant_amount' in u:
            grant_amount = u['grant_amount']

        if ntype == 'token_grant' and grant_amount > 0:
            space = conn.execute(
                "SELECT id FROM user_spaces WHERE user_id = ? AND name = '试用'",
                (u['id'],)).fetchone()
            if space:
                conn.execute(
                    "UPDATE user_spaces SET tokens = tokens + ?, "
                    "updated_at = datetime('now') WHERE id = ?",
                    (grant_amount, space['id']))
                conn.execute(
                    "UPDATE users SET remaining_tokens = remaining_tokens + ?, "
                    "updated_at = datetime('now') WHERE id = ?",
                    (grant_amount, u['id']))
            else:
                conn.execute(
                    "INSERT INTO user_spaces (user_id, name, description, tokens) "
                    "VALUES (?, '试用', '专属AI试用空间', ?)",
                    (u['id'], grant_amount))
                conn.execute(
                    "UPDATE users SET remaining_tokens = remaining_tokens + ?, "
                    "updated_at = datetime('now') WHERE id = ?",
                    (grant_amount, u['id']))

        conn.execute(
            "INSERT INTO user_notifications (user_id, notification_id) "
            "VALUES (?, ?)", (u['id'], notification_id))

        if u['is_verified']:
            send_notification_email(u['email'], subject, body,
                ntype, grant_amount)

        sent_count += 1

    conn.commit()
    conn.close()

    log_admin_action(request.current_user, 'send_notification',
        'notification', notification_id,
        f"类型:{ntype}, 目标:{target_type}, 主题:{subject}")

    return json_response({
        "message": f"通知已发送给 {sent_count} 个用户",
        "notification_id": notification_id,
        "sent_count": sent_count
    })


@app.route('/api/admin/notifications', methods=['GET'])
@require_admin
def admin_list_notifications():
    conn = get_db()
    notifications = conn.execute(
        "SELECT an.*, u.username as admin_name "
        "FROM admin_notifications an "
        "LEFT JOIN users u ON an.admin_id = u.id "
        "ORDER BY an.created_at DESC LIMIT 50"
    ).fetchall()
    conn.close()
    return json_response({"notifications": [dict(n) for n in notifications]})


@app.route('/api/notifications', methods=['GET'])
@require_auth
def list_user_notifications():
    user = request.current_user
    conn = get_db()
    notifications = conn.execute(
        "SELECT un.id as user_notification_id, un.is_read, un.read_at, "
        "un.is_claimed, un.claimed_at, "
        "an.subject, an.body, an.type, an.token_amount, an.created_at, "
        "u.username as admin_name "
        "FROM user_notifications un "
        "JOIN admin_notifications an ON un.notification_id = an.id "
        "LEFT JOIN users u ON an.admin_id = u.id "
        "WHERE un.user_id = ? "
        "ORDER BY an.created_at DESC LIMIT 100",
        (user['id'],)).fetchall()
    unread_count = conn.execute(
        "SELECT COUNT(*) as c FROM user_notifications "
        "WHERE user_id = ? AND is_read = 0",
        (user['id'],)).fetchone()['c']
    conn.close()
    return json_response({
        "notifications": [dict(n) for n in notifications],
        "unread_count": unread_count
    })


@app.route('/api/notifications/<int:notification_id>/read', methods=['POST'])
@require_auth
def mark_notification_read(notification_id):
    user = request.current_user
    conn = get_db()
    conn.execute(
        "UPDATE user_notifications SET is_read = 1, read_at = datetime('now') "
        "WHERE id = ? AND user_id = ?",
        (notification_id, user['id']))
    conn.commit()
    conn.close()
    tdengine.update_read(user['id'], notification_id)
    return json_response({"message": "已标记为已读"})


@app.route('/api/notifications/read-all', methods=['POST'])
@require_auth
def mark_all_notifications_read():
    user = request.current_user
    conn = get_db()
    conn.execute(
        "UPDATE user_notifications SET is_read = 1, read_at = datetime('now') "
        "WHERE user_id = ? AND is_read = 0",
        (user['id'],))
    conn.commit()
    conn.close()
    return json_response({"message": "已全部标记为已读"})


@app.route('/api/notifications/<int:notification_id>/delete', methods=['POST'])
@require_auth
def delete_notification(notification_id):
    user = request.current_user
    conn = get_db()
    conn.execute(
        "DELETE FROM user_notifications WHERE id = ? AND user_id = ?",
        (notification_id, user['id']))
    conn.commit()
    conn.close()
    tdengine.delete_entry(user['id'], notification_id)
    return json_response({"message": "通知已删除"})


@app.route('/api/notifications/<int:notification_id>/claim', methods=['POST'])
@require_auth
def claim_notification(notification_id):
    user = request.current_user
    conn = get_db()
    notif = conn.execute(
        "SELECT un.id, an.type, an.token_amount "
        "FROM user_notifications un "
        "JOIN admin_notifications an ON un.notification_id = an.id "
        "WHERE un.id = ? AND un.user_id = ?",
        (notification_id, user['id'])).fetchone()
    if not notif:
        conn.close()
        return json_response({"error": "通知不存在"}, 404)
    if notif['type'] != 'token_grant':
        conn.close()
        return json_response({"error": "该通知不可领取"}, 400)
    if notif['token_amount'] <= 0:
        conn.close()
        return json_response({"error": "无效的Token数量"}, 400)
    un_claimed = conn.execute(
        "SELECT is_claimed FROM user_notifications WHERE id = ?",
        (notification_id,)).fetchone()
    if un_claimed and un_claimed['is_claimed']:
        conn.close()
        return json_response({"error": "Token已被领取"}, 400)
    space = conn.execute(
        "SELECT id FROM user_spaces WHERE user_id = ? AND name = '试用'",
        (user['id'],)).fetchone()
    if not space:
        conn.execute(
            "INSERT INTO user_spaces (user_id, name, description, tokens) "
            "VALUES (?, '试用', '专属AI试用空间', ?)",
            (user['id'], notif['token_amount']))
        conn.execute(
            "UPDATE users SET remaining_tokens = remaining_tokens + ? "
            "WHERE id = ?", (notif['token_amount'], user['id']))
    else:
        conn.execute(
            "UPDATE user_spaces SET tokens = tokens + ?, "
            "updated_at = datetime('now') WHERE id = ?",
            (notif['token_amount'], space['id']))
        conn.execute(
            "UPDATE users SET remaining_tokens = remaining_tokens + ? "
            "WHERE id = ?", (notif['token_amount'], user['id']))
    conn.execute(
        "UPDATE user_notifications SET is_claimed = 1, "
        "claimed_at = datetime('now') WHERE id = ?",
        (notification_id,))
    conn.commit()
    conn.close()
    tdengine.update_claimed(user['id'], notification_id)
    return json_response({
        "message": f"已领取 {notif['token_amount']} Token",
        "token_amount": notif['token_amount']
    })


def cleanup_old_notifications():
    try:
        conn = get_db()
        cutoff = (datetime.now() - timedelta(days=30)).strftime(
            '%Y-%m-%d %H:%M:%S')
        deleted = conn.execute(
            "DELETE FROM user_notifications WHERE created_at < ?",
            (cutoff,)).rowcount
        an_deleted = conn.execute(
            "DELETE FROM admin_notifications WHERE created_at < ?",
            (cutoff,)).rowcount
        conn.commit()
        conn.close()
        tdengine.cleanup_old(30)
        if deleted > 0 or an_deleted > 0:
            logger.info(f"清理了 {deleted} 条用户通知和 {an_deleted} 条系统通知")
    except Exception as e:
        logger.error(f"清理通知失败: {e}")


@app.route('/api/admin/usage-stats', methods=['GET'])
@require_admin
def admin_usage_stats():
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()['c']
    verified = conn.execute(
        "SELECT COUNT(*) as c FROM users WHERE is_verified = 1"
    ).fetchone()['c']
    active = conn.execute(
        "SELECT COUNT(*) as c FROM users WHERE is_active = 1"
    ).fetchone()['c']
    conn.close()
    return json_response({
        "total_users": total,
        "verified_users": verified,
        "active_users": active
    })


@app.route('/api/admin/ip-bans', methods=['GET'])
@require_admin
def admin_list_ip_bans():
    search = request.args.get('search', '').strip()
    conn = get_db()
    if search:
        bans = conn.execute(
            "SELECT * FROM ip_bans WHERE ip_address LIKE ? ORDER BY created_at DESC",
            (f'%{search}%',)).fetchall()
    else:
        bans = conn.execute(
            "SELECT * FROM ip_bans ORDER BY created_at DESC LIMIT 200").fetchall()
    conn.close()
    return json_response({"bans": [dict(b) for b in bans]})


@app.route('/api/admin/ip-bans', methods=['POST'])
@require_admin
def admin_add_ip_ban():
    data = request.get_json()
    ip_address = (data.get('ip_address') or '').strip()
    reason = (data.get('reason') or '').strip()
    ban_type = data.get('ban_type', 'manual')
    expires_in_minutes = data.get('expires_in_minutes')

    if not ip_address:
        return json_response({"error": "请输入IP地址"}, 400)
    if not is_valid_ip(ip_address):
        return json_response({"error": "无效的IP地址格式"}, 400)
    if not reason:
        return json_response({"error": "请输入封禁原因"}, 400)

    expires_at = None
    if expires_in_minutes and int(expires_in_minutes) > 0:
        expires_at = (datetime.now() + timedelta(
            minutes=int(expires_in_minutes))).strftime('%Y-%m-%d %H:%M:%S')

    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM ip_bans WHERE ip_address = ? AND is_active = 1",
        (ip_address,)).fetchone()
    if existing:
        conn.close()
        return json_response({"error": "该IP已被封禁"}, 409)

    conn.execute(
        "INSERT INTO ip_bans (ip_address, reason, ban_type, banned_by, expires_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (ip_address, reason, ban_type, request.current_user['id'], expires_at))
    conn.commit()
    ban_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    ban = conn.execute("SELECT * FROM ip_bans WHERE id = ?", (ban_id,)).fetchone()
    conn.close()

    log_admin_action(request.current_user, 'add_ip_ban',
        'ip_ban', ban_id,
        f"封禁IP:{ip_address}, 原因:{reason}, 类型:{ban_type}, 过期:{expires_at or '永久'}")

    return json_response({"ban": dict(ban), "message": "IP已封禁"})


@app.route('/api/admin/ip-bans/<int:ban_id>', methods=['PUT'])
@require_admin
def admin_update_ip_ban(ban_id):
    data = request.get_json()
    conn = get_db()
    ban = conn.execute("SELECT * FROM ip_bans WHERE id = ?", (ban_id,)).fetchone()
    if not ban:
        conn.close()
        return json_response({"error": "封禁记录不存在"}, 404)

    reason = data.get('reason')
    is_active = data.get('is_active')
    expires_in_minutes = data.get('expires_in_minutes')

    updates = ["updated_at = datetime('now')"]
    params = []

    if reason is not None:
        updates.append("reason = ?")
        params.append(reason)
    if is_active is not None:
        updates.append("is_active = ?")
        params.append(1 if is_active else 0)
    if expires_in_minutes is not None:
        if int(expires_in_minutes) > 0:
            exp = (datetime.now() + timedelta(minutes=int(expires_in_minutes))).strftime('%Y-%m-%d %H:%M:%S')
            updates.append("expires_at = ?")
            params.append(exp)
        else:
            updates.append("expires_at = NULL")

    if params:
        params.append(ban_id)
        conn.execute(
            f"UPDATE ip_bans SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    ban = conn.execute("SELECT * FROM ip_bans WHERE id = ?", (ban_id,)).fetchone()
    conn.close()
    log_admin_action(request.current_user, 'update_ip_ban',
        'ip_ban', ban_id,
        f"更新封禁IP:{ban['ip_address']}")
    return json_response({"ban": dict(ban), "message": "封禁已更新"})


@app.route('/api/admin/ip-bans/<int:ban_id>', methods=['DELETE'])
@require_admin
def admin_delete_ip_ban(ban_id):
    conn = get_db()
    ban = conn.execute("SELECT * FROM ip_bans WHERE id = ?", (ban_id,)).fetchone()
    if not ban:
        conn.close()
        return json_response({"error": "封禁记录不存在"}, 404)

    conn.execute("UPDATE ip_bans SET is_active = 0, updated_at = datetime('now') WHERE id = ?", (ban_id,))
    conn.commit()
    conn.close()
    log_admin_action(request.current_user, 'remove_ip_ban',
        'ip_ban', ban_id,
        f"解封IP:{ban['ip_address']}")
    return json_response({"message": "IP已解封"})


@app.route('/api/admin/ip-tracking', methods=['GET'])
@require_admin
def admin_list_ip_tracking():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    per_page = min(200, max(10, per_page))
    offset = (page - 1) * per_page
    sort_by = request.args.get('sort_by', 'last_seen')
    sort_order = request.args.get('sort_order', 'DESC')

    allowed_sort = {'last_seen', 'first_seen', 'request_count'}
    if sort_by not in allowed_sort:
        sort_by = 'last_seen'
    if sort_order not in ('ASC', 'DESC'):
        sort_order = 'DESC'

    search = request.args.get('search', '').strip()

    conn = get_db()
    if search:
        total = conn.execute(
            "SELECT COUNT(DISTINCT ip_address) as c FROM ip_tracking WHERE ip_address LIKE ?",
            (f'%{search}%',)).fetchone()['c']
        rows = conn.execute(
            f"SELECT ip_address, SUM(request_count) as total_requests, "
            f"COUNT(DISTINCT endpoint) as endpoint_count, "
            f"GROUP_CONCAT(DISTINCT user_agent) as user_agents, "
            f"MIN(first_seen) as first_seen, MAX(last_seen) as last_seen "
            f"FROM ip_tracking WHERE ip_address LIKE ? "
            f"GROUP BY ip_address ORDER BY {sort_by} {sort_order} "
            f"LIMIT ? OFFSET ?",
            (f'%{search}%', per_page, offset)).fetchall()
    else:
        total = conn.execute(
            "SELECT COUNT(DISTINCT ip_address) as c FROM ip_tracking").fetchone()['c']
        rows = conn.execute(
            f"SELECT ip_address, SUM(request_count) as total_requests, "
            f"COUNT(DISTINCT endpoint) as endpoint_count, "
            f"GROUP_CONCAT(DISTINCT user_agent) as user_agents, "
            f"MIN(first_seen) as first_seen, MAX(last_seen) as last_seen "
            f"FROM ip_tracking GROUP BY ip_address "
            f"ORDER BY {sort_by} {sort_order} "
            f"LIMIT ? OFFSET ?",
            (per_page, offset)).fetchall()
    conn.close()

    return json_response({
        "tracking": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page
    })


@app.route('/api/admin/audit-log', methods=['GET'])
@require_admin
def admin_audit_log():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    per_page = min(200, max(10, per_page))
    offset = (page - 1) * per_page

    conn = get_db()
    total = conn.execute(
        "SELECT COUNT(*) as c FROM admin_audit_log").fetchone()['c']
    logs = conn.execute(
        "SELECT * FROM admin_audit_log ORDER BY created_at DESC "
        "LIMIT ? OFFSET ?", (per_page, offset)).fetchall()
    conn.close()

    return json_response({
        "logs": [dict(l) for l in logs],
        "total": total,
        "page": page,
        "per_page": per_page
    })


# ==================== 讯飞批处理适配器 ====================

class XunfeiBatchAdapter:
    MODEL_MAPPING = {
        "qwen-7b-chat": "xop35qwen2b",
        "qwen-14b-chat": "xop35qwen2b",
        "qwen-max": "xop35qwen2b",
        "qwen-turbo": "xop35qwen2b",
        "qwen-plus": "xop35qwen2b",
        "qwen": "xop35qwen2b",
        "Qwen": "xop35qwen2b",
        "Qwen3.5": "xop35qwen2b",
        "qwen3.5": "xop35qwen2b",
        "deepseek-chat": "xop35qwen2b",
        "deepseek": "xop35qwen2b",
        "spark": "xop35qwen2b",
    }

    def __init__(self, api_password: str):
        self.api_password = api_password
        self.base_url = "https://spark-api-open.xf-yun.com"
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_password}",
        })
        self._jobs = {}
        self._job_lock = threading.Lock()
        logger.info("适配器初始化完成")

    def _resolve_model(self, model: str) -> str:
        return self.MODEL_MAPPING.get(model, "xop35qwen2b")

    def _build_messages(self, messages: list, system_message: str = None) -> list:
        result = []
        if system_message:
            result.append({"role": "system", "content": system_message})
        for msg in messages:
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            if isinstance(content, bytes):
                content = content.decode('utf-8')
            if role in ('user', 'assistant', 'system'):
                result.append({"role": role, "content": content})
        return result

    BATCH_TEMP_DIR = os.path.join(tempfile.gettempdir(), 'dingdang_batch')

    def _ensure_temp_dir(self):
        os.makedirs(self.BATCH_TEMP_DIR, exist_ok=True)

    def _create_batch_file(self, messages: list, model: str,
                           max_tokens: int, temperature: float,
                           system_message: str = None,
                           custom_id: str = None) -> str:
        self._ensure_temp_dir()
        file_path = os.path.join(self.BATCH_TEMP_DIR, f"batch_{uuid.uuid4().hex[:8]}.jsonl")
        xunfei_model_id = self._resolve_model(model)
        body_messages = self._build_messages(messages, system_message)
        request_line = {
            "custom_id": custom_id or f"req_{uuid.uuid4().hex[:8]}",
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": xunfei_model_id,
                "messages": body_messages,
                "max_tokens": min(max_tokens, 4096),
                "temperature": temperature
            }
        }
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(json.dumps(request_line, ensure_ascii=False) + '\n')
        logger.info(f"创建批处理文件: {file_path} (消息数: {len(body_messages)}, 模型: {xunfei_model_id})")
        for idx, msg in enumerate(body_messages):
            content = msg.get('content', '')
            logger.info(f"  消息[{idx}] role={msg.get('role')} content_preview={content[:80]}")
        return file_path

    def _create_batch_file_multi(self, requests: list) -> str:
        self._ensure_temp_dir()
        file_path = os.path.join(self.BATCH_TEMP_DIR, f"batch_{uuid.uuid4().hex[:8]}.jsonl")
        with open(file_path, 'w', encoding='utf-8') as f:
            for req in requests:
                f.write(json.dumps(req, ensure_ascii=False) + '\n')
        logger.info(f"创建多请求批处理文件: {file_path} (请求数: {len(requests)})")
        return file_path

    def _upload_file(self, file_path: str) -> Optional[str]:
        url = f"{self.base_url}/v1/files"
        file_size = os.path.getsize(file_path)
        logger.info(f"开始上传文件: {file_path} (大小: {file_size} 字节)")
        with open(file_path, 'rb') as f:
            response = self.session.post(url,
                files={
                    'file': (os.path.basename(file_path), f,
                             'application/jsonl; charset=utf-8')
                },
                data={'purpose': 'batch'})
            if response.status_code == 200:
                file_id = response.json().get('id')
                logger.info(f"文件上传成功: file_id={file_id}, 大小={file_size} 字节")
                return file_id
            else:
                logger.error(f"文件上传失败: status={response.status_code}, body={response.text[:500]}")
                return None

    def _create_batch(self, input_file_id: str) -> Optional[str]:
        url = f"{self.base_url}/v1/batches"
        payload = {
            "input_file_id": input_file_id,
            "endpoint": "/v1/chat/completions",
            "completion_window": "24h"
        }
        logger.info(f"创建批处理任务: input_file_id={input_file_id}, endpoint=/v1/chat/completions")
        response = self.session.post(url, json=payload)
        if response.status_code == 200:
            batch_id = response.json().get('id')
            logger.info(f"批处理任务创建成功: batch_id={batch_id}, input_file_id={input_file_id}")
            return batch_id
        else:
            logger.error(f"创建批处理失败: status={response.status_code}, body={response.text[:500]}")
            return None

    def _get_batch_status(self, batch_id: str) -> Optional[Dict]:
        url = f"{self.base_url}/v1/batches/{batch_id}"
        response = self.session.get(url)
        if response.status_code == 200:
            data = response.json()
            status = data.get('status', 'unknown')
            logger.info(f"查询批处理状态: batch_id={batch_id}, status={status}")
            return data
        else:
            logger.error(f"查询状态失败: batch_id={batch_id}, status={response.status_code}, body={response.text[:500]}")
            return None

    def _wait_for_completion(self, batch_id: str,
                             timeout: int = 120,
                             poll_interval: float = 0.5) -> Optional[Dict]:
        start_time = time.time()
        last_status = None
        while time.time() - start_time < timeout:
            elapsed = time.time() - start_time
            result = self._get_batch_status(batch_id)
            if result:
                status = result.get('status')
                if status != last_status:
                    logger.info(f"任务状态变更: {last_status} -> {status} (耗时: {elapsed:.1f}s)")
                    if status in ('completed', 'failed', 'expired', 'canceled'):
                        otpt = result.get('output_file_id', 'N/A')
                        errt = result.get('error_file_id', 'N/A')
                        counts = result.get('request_counts', {})
                        logger.info(f"批处理结束: batch_id={batch_id}, status={status}, "
                                    f"output_file_id={otpt}, error_file_id={errt}, "
                                    f"total={counts.get('total', 0)}, "
                                    f"completed={counts.get('completed', 0)}, "
                                    f"failed={counts.get('failed', 0)}")
                    last_status = status
                if status in ('completed', 'failed', 'expired', 'canceled'):
                    return result
            elif elapsed > 10:
                logger.warning(f"无法获取任务状态，继续轮询 (batch_id={batch_id})")
            current_interval = poll_interval if elapsed < 30 else 1.0
            time.sleep(current_interval)
        logger.error(f"任务轮询超时: batch_id={batch_id}, timeout={timeout}s")
        return None

    def _download_file_content(self, file_id: str) -> Optional[str]:
        url = f"{self.base_url}/v1/files/{file_id}/content"
        logger.info(f"开始下载文件内容: file_id={file_id}")
        response = self.session.get(url, stream=True)
        if response.status_code == 200:
            response.encoding = 'utf-8'
            content = response.text
            if isinstance(content, bytes):
                content = content.decode('utf-8')
            if 'Ã¤' in content or 'Â¥' in content:
                content = content.encode('latin-1').decode('utf-8')
            logger.info(f"文件下载成功: file_id={file_id}, 内容长度={len(content)} 字符")
            return content
        else:
            logger.error(f"文件下载失败: file_id={file_id}, status={response.status_code}")
            return None

    def _parse_result_file(self, content: str) -> str:
        if not content:
            return ""
        lines = content.strip().split('\n')
        for line in lines:
            if not line:
                continue
            try:
                data = json.loads(line)
                if 'response' in data:
                    body = data['response'].get('body', {})
                    choices = body.get('choices', [])
                    if choices:
                        msg = choices[0].get('message', {})
                        if msg:
                            return msg.get('content', '')
                if 'body' in data:
                    choices = data['body'].get('choices', [])
                    if choices:
                        msg = choices[0].get('message', {})
                        if msg:
                            return msg.get('content', '')
                if 'choices' in data:
                    choices = data['choices']
                    if choices:
                        msg = choices[0].get('message', {})
                        if msg:
                            return msg.get('content', '')
                        text = choices[0].get('text', '')
                        if text:
                            return text
            except json.JSONDecodeError:
                continue
        return ""

    def _cleanup(self, file_path: str):
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"删除临时文件: {file_path}")

    def _parse_input_file(self, content: str) -> list:
        lines = content.strip().split('\n')
        results = []
        for line in lines:
            if not line:
                continue
            try:
                data = json.loads(line)
                body = data.get('body', {})
                messages = body.get('messages', [])
                custom_id = data.get('custom_id', '')
                user_msg = ""
                for msg in messages:
                    if msg.get('role') == 'user':
                        user_msg = msg.get('content', '')
                results.append({"custom_id": custom_id, "messages": messages, "user_message": user_msg})
            except json.JSONDecodeError:
                continue
        return results

    def _get_batch_results(self, batch_id: str) -> Optional[Dict]:
        batch_status = self._get_batch_status(batch_id)
        if not batch_status:
            return None
        status = batch_status.get('status')
        output_file_id = batch_status.get('output_file_id')
        input_file_id = batch_status.get('input_file_id')
        result = {
            "batch_id": batch_id,
            "status": status,
            "input_file_id": input_file_id,
            "output_file_id": output_file_id,
            "requests": [],
            "responses": []
        }
        if input_file_id:
            input_content = self._download_file_content(input_file_id)
            if input_content:
                result["requests"] = self._parse_input_file(input_content)
                logger.info(f"解析输入文件: file_id={input_file_id}, requests_count={len(result['requests'])}")
        if status == 'completed' and output_file_id:
            output_content = self._download_file_content(output_file_id)
            if output_content:
                lines = output_content.strip().split('\n')
                for line in lines:
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        custom_id = data.get('custom_id', '')
                        resp_body = data.get('response', {}).get('body', {})
                        choices = resp_body.get('choices', [])
                        answer = ""
                        if choices:
                            msg = choices[0].get('message', {})
                            if msg:
                                answer = msg.get('content', '')
                        result["responses"].append({
                            "custom_id": custom_id,
                            "answer": answer
                        })
                    except json.JSONDecodeError:
                        continue
                logger.info(f"解析结果文件: file_id={output_file_id}, responses_count={len(result['responses'])}")
        return result

    def process_prompt(self, messages: list, model: str = "qwen",
                       max_tokens: int = 500,
                       temperature: float = 0.7,
                       system_message: str = None) -> Dict:
        file_path = None
        try:
            prompt_preview = ""
            for msg in messages:
                c = msg.get('content', '')
                if isinstance(c, bytes):
                    c = c.decode('utf-8')
                prompt_preview += c
            logger.info(f"开始处理批处理请求: model={model}, max_tokens={max_tokens}, "
                        f"messages_len={len(messages)}, prompt_preview={prompt_preview[:100]}")
            file_path = self._create_batch_file(
                messages, model, max_tokens, temperature, system_message)
            file_id = self._upload_file(file_path)
            if not file_id:
                return {"error": "文件上传失败"}
            batch_id = self._create_batch(file_id)
            if not batch_id:
                return {"error": "创建批处理任务失败"}
            logger.info(f"等待批处理完成: batch_id={batch_id}")
            batch_result = self._wait_for_completion(batch_id, timeout=120)
            if not batch_result:
                return {"error": "批处理任务超时"}
            status = batch_result.get('status')
            output_file_id = batch_result.get('output_file_id')
            if status != 'completed':
                err_msg = batch_result.get('errors', {})
                logger.error(f"批处理失败: batch_id={batch_id}, status={status}, errors={err_msg}")
                return {"error": f"批处理任务失败: {status}", "detail": err_msg}
            if not output_file_id:
                return {"error": "没有结果文件"}
            logger.info(f"批处理完成，下载结果文件: output_file_id={output_file_id}")
            result_content = self._download_file_content(output_file_id)
            if not result_content:
                return {"error": "下载结果文件失败"}
            answer = self._parse_result_file(result_content)
            if not answer:
                return {"error": "无法解析结果文件，可能内容为空"}
            if isinstance(answer, bytes):
                answer = answer.decode('utf-8')
            prompt_text = ""
            for msg in messages:
                c = msg.get('content', '')
                if isinstance(c, bytes):
                    c = c.decode('utf-8')
                prompt_text += c
            logger.info(f"批处理请求完成: batch_id={batch_id}, "
                        f"prompt_len={len(prompt_text)}, answer_len={len(answer)}, "
                        f"answer_preview={answer[:100]}")
            return {
                "id": f"cmpl-{uuid.uuid4().hex[:12]}",
                "object": "text_completion",
                "created": int(time.time()),
                "model": model,
                "choices": [
                    {"text": answer, "index": 0, "logprobs": None,
                     "finish_reason": "stop"}
                ],
                "usage": {
                    "prompt_tokens": calculate_tokens(prompt_text),
                    "completion_tokens": calculate_tokens(answer),
                    "total_tokens": (calculate_tokens(prompt_text) +
                                     calculate_tokens(answer))
                }
            }
        except Exception as e:
            logger.error(f"处理异常: {str(e)}", exc_info=True)
            return {"error": f"内部错误: {str(e)}"}
        finally:
            if file_path:
                self._cleanup(file_path)

    def generate_sse_events(self, messages: list, model: str = "qwen",
                            max_tokens: int = 500,
                            temperature: float = 0.7,
                            system_message: str = None):
        result = self.process_prompt(
            messages, model, max_tokens, temperature, system_message)
        if "error" in result:
            yield f"data: {json.dumps({'error': result['error']}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            return
        answer_text = result["choices"][0]["text"]
        response_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
        created = int(time.time())
        model_name = model
        full_response = {
            "id": response_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model_name,
            "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}]
        }
        yield f"data: {json.dumps(full_response, ensure_ascii=False)}\n\n"
        chunk_size = 4
        for i in range(0, len(answer_text), chunk_size):
            chunk_text = answer_text[i:i + chunk_size]
            chunk_data = {
                "id": response_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model_name,
                "choices": [{"index": 0, "delta": {"content": chunk_text}, "finish_reason": None}]
            }
            yield f"data: {json.dumps(chunk_data, ensure_ascii=False)}\n\n"
            time.sleep(0.02)
        done_data = {
            "id": response_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model_name,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]
        }
        yield f"data: {json.dumps(done_data, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    def submit_job(self, messages: list, model: str = "qwen",
                   max_tokens: int = 500,
                   temperature: float = 0.7,
                   system_message: str = None,
                   user_id: int = None) -> str:
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        with self._job_lock:
            self._jobs[job_id] = {
                "id": job_id,
                "status": "queued",
                "created_at": int(time.time()),
                "updated_at": int(time.time()),
                "user_id": user_id,
                "model": model,
                "result": None,
                "error": None
            }
        thread = threading.Thread(
            target=self._process_job_background,
            args=(job_id, messages, model, max_tokens, temperature, system_message),
            daemon=True
        )
        thread.start()
        prompt_preview = ""
        for msg in messages:
            c = msg.get('content', '')
            if isinstance(c, bytes):
                c = c.decode('utf-8')
            prompt_preview += c
        logger.info(f"异步任务已提交: job_id={job_id}, model={model}, "
                    f"messages_len={len(messages)}, prompt_preview={prompt_preview[:80]}")
        return job_id

    def _process_job_background(self, job_id: str, messages: list,
                                 model: str, max_tokens: int,
                                 temperature: float,
                                 system_message: str = None):
        def update(status: str, result=None, error=None):
            with self._job_lock:
                if job_id in self._jobs:
                    self._jobs[job_id]["status"] = status
                    self._jobs[job_id]["updated_at"] = int(time.time())
                    if result:
                        self._jobs[job_id]["result"] = result
                    if error:
                        self._jobs[job_id]["error"] = error
        try:
            update("processing")
            logger.info(f"后台任务开始执行: job_id={job_id}")
            result = self.process_prompt(
                messages, model, max_tokens, temperature, system_message)
            if "error" in result:
                logger.error(f"后台任务失败: job_id={job_id}, error={result['error']}")
                update("failed", error=result["error"])
            else:
                answer = result.get("choices", [{}])[0].get("text", "")
                logger.info(f"后台任务完成: job_id={job_id}, answer_len={len(answer)}, "
                            f"answer_preview={answer[:80]}")
                update("completed", result=result)
        except Exception as e:
            logger.error(f"后台任务异常: job_id={job_id}, error={str(e)}", exc_info=True)
            update("failed", error=str(e))

    def get_job(self, job_id: str) -> Optional[Dict]:
        with self._job_lock:
            return self._jobs.get(job_id)

    def list_jobs(self, limit: int = 20, user_id: int = None) -> list:
        with self._job_lock:
            jobs = list(self._jobs.values())
            if user_id is not None:
                jobs = [j for j in jobs if j.get("user_id") == user_id]
            jobs.sort(key=lambda j: j.get("created_at", 0), reverse=True)
            return jobs[:limit]

    def list_files(self, page: int = 1, size: int = 20) -> Optional[Dict]:
        url = f"{self.base_url}/v1/files?page={page}&size={size}"
        response = self.session.get(url)
        if response.status_code == 200:
            return response.json()
        logger.error(f"查询文件列表失败: {response.status_code}")
        return None

    def get_file_info(self, file_id: str) -> Optional[Dict]:
        url = f"{self.base_url}/v1/files/{file_id}"
        response = self.session.get(url)
        if response.status_code == 200:
            return response.json()
        logger.error(f"查询文件信息失败: {response.status_code}")
        return None

    def delete_file(self, file_id: str) -> Optional[Dict]:
        url = f"{self.base_url}/v1/files/{file_id}"
        response = self.session.delete(url)
        if response.status_code == 200:
            return response.json()
        logger.error(f"删除文件失败: {response.status_code}")
        return None

    def list_batches(self, limit: int = 10, after: str = None) -> Optional[Dict]:
        url = f"{self.base_url}/v1/batches?limit={limit}"
        if after:
            url += f"&after={after}"
        else:
            url += "&after=_"
        response = self.session.get(url)
        if response.status_code == 200:
            return response.json()
        logger.error(f"查询批处理列表失败: status={response.status_code}, body={response.text[:500]}")
        return None

    def cancel_batch(self, batch_id: str) -> Optional[Dict]:
        url = f"{self.base_url}/v1/batches/{batch_id}/cancel"
        response = self.session.get(url)
        if response.status_code == 200:
            return response.json()
        logger.error(f"取消批处理失败: {response.status_code}")
        return None

    def upload_and_batch(self, requests_data: list) -> Dict:
        file_path = None
        try:
            file_path = self._create_batch_file_multi(requests_data)
            file_id = self._upload_file(file_path)
            if not file_id:
                return {"error": "文件上传失败"}
            batch_id = self._create_batch(file_id)
            if not batch_id:
                return {"error": "创建批处理任务失败"}
            return {
                "file_id": file_id,
                "batch_id": batch_id,
                "status": "created",
                "message": "批处理任务已创建，可通过 /v1/batch/batches/{batch_id} 查询状态"
            }
        except Exception as e:
            logger.error(f"上传并批处理异常: {str(e)}")
            return {"error": str(e)}
        finally:
            if file_path:
                self._cleanup(file_path)


API_PASSWORD = CFG['api']['xfyun_password']
ADAPTER = XunfeiBatchAdapter(API_PASSWORD) if API_PASSWORD else None


def extract_real_question(messages: list) -> str:
    user_question = ""
    for msg in messages:
        role = msg.get('role', '')
        content = msg.get('content', '')
        if role == 'user':
            if isinstance(content, bytes):
                content = content.decode('utf-8')
            if 'Task:' in content or 'Task：' in content:
                lines = content.split('\n')
                for line in lines:
                    if line.startswith('Task:'):
                        user_question = line.replace('Task:', '').strip()
                        break
                    elif line.startswith('Task：'):
                        user_question = line.replace('Task：', '').strip()
                        break
                if not user_question and lines:
                    first_line = lines[0]
                    user_question = first_line.replace('Task:', '')\
                        .replace('Task：', '').strip()
            else:
                user_question = content
            break
    if not user_question:
        user_question = "你好"
    logger.info(f"提取的问题: {user_question}")
    return user_question


def get_token_config_values():
    _cache = get_token_config_values.__dict__
    now = time.time()
    if 'cached' in _cache and now - _cache['cached'] < 60:
        return _cache['value']
    conn = get_db()
    cfg = conn.execute(
        "SELECT * FROM token_config ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    if cfg:
        value = {
            "chinese_ratio": cfg['chinese_ratio'],
            "english_ratio": cfg['english_ratio'],
            "other_ratio": cfg['other_ratio']
        }
    else:
        value = {"chinese_ratio": 2.0, "english_ratio": 4.0, "other_ratio": 2.0}
    _cache['value'] = value
    _cache['cached'] = now
    return value


def calculate_tokens(text: str) -> int:
    if not text:
        return 0
    config = get_token_config_values()
    chinese_chars = 0
    english_chars = 0
    other_chars = 0
    for char in text:
        if '\u4e00' <= char <= '\u9fff':
            chinese_chars += 1
        elif char.isascii():
            english_chars += 1
        else:
            other_chars += 1
    tokens = int(
        (chinese_chars / config['chinese_ratio']) +
        (english_chars / config['english_ratio']) +
        (other_chars / config['other_ratio']) +
        0.5)
    return max(tokens, 1)


# ==================== API 路由 ====================

def load_space_context(space_id: int, user_id: int) -> list:
    conn = get_db()
    space = conn.execute(
        "SELECT id FROM user_spaces WHERE id = ? AND user_id = ?",
        (space_id, user_id)).fetchone()
    if not space:
        conn.close()
        return None
    settings = conn.execute(
        "SELECT max_context_messages, max_context_tokens FROM user_context_settings WHERE user_id = ?",
        (user_id,)).fetchone()
    max_messages = settings['max_context_messages'] if settings else 20
    max_tokens = settings['max_context_tokens'] if settings else 4000
    contexts = conn.execute(
        "SELECT role, content, token_count FROM space_contexts "
        "WHERE space_id = ? ORDER BY id ASC",
        (space_id,)).fetchall()
    conn.close()
    context_messages = []
    total_tokens = 0
    for ctx in reversed(contexts):
        if len(context_messages) >= max_messages:
            break
        if total_tokens + (ctx['token_count'] or 0) > max_tokens:
            break
        context_messages.insert(0, {
            "role": ctx['role'],
            "content": ctx['content']
        })
        total_tokens += ctx['token_count'] or 0
    return context_messages


def save_space_context(space_id: int, user_id: int, role: str, content: str):
    token_count = calculate_tokens(content)
    conn = get_db()
    conn.execute(
        "INSERT INTO space_contexts (space_id, user_id, role, content, token_count) "
        "VALUES (?, ?, ?, ?, ?)",
        (space_id, user_id, role, content, token_count))
    conn.commit()
    conn.close()


def load_room_context(room_id: str) -> list:
    # load contexts for a given room_id, only last 7 days
    conn = get_db()
    settings = None
    # we can't easily tie settings to a room, so use sensible defaults
    max_messages = 20
    max_tokens = 4000
    seven_days_ago = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')
    contexts = conn.execute(
        "SELECT role, content, token_count, created_at FROM space_contexts "
        "WHERE room_id = ? AND created_at >= ? ORDER BY id ASC",
        (room_id, seven_days_ago)).fetchall()
    conn.close()
    if contexts is None:
        return []
    context_messages = []
    total_tokens = 0
    for ctx in reversed(contexts):
        if len(context_messages) >= max_messages:
            break
        if total_tokens + (ctx['token_count'] or 0) > max_tokens:
            break
        context_messages.insert(0, {
            "role": ctx['role'],
            "content": ctx['content']
        })
        total_tokens += ctx['token_count'] or 0
    return context_messages


def save_room_context(room_id: str, user_id: int, role: str, content: str):
    token_count = calculate_tokens(content)
    conn = get_db()
    conn.execute(
        "INSERT INTO space_contexts (space_id, user_id, role, content, token_count, room_id) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (0, user_id, role, content, token_count, room_id))
    conn.commit()
    conn.close()


@app.route('/v1/chat/completions', methods=['POST'])
def chat_completions():
    try:
        client_ip = get_client_ip()
        user = authenticate_request()
        if not user:
            return json_response({"error": "请提供有效的认证凭证"}, 401)
        status_error = validate_user_status(user)
        if status_error:
            return status_error

        raw_data = request.get_data(as_text=True)
        logger.info(f"原始请求数据: {raw_data[:200]}")
        data = request.get_json()
        if not data:
            data = json.loads(raw_data)
        logger.info("=" * 60)
        logger.info("收到 /v1/chat/completions 请求")
        messages = data.get('messages', [])
        space_id = data.get('space_id')
        room_id = data.get('room_id', '1')
        max_tokens = data.get('max_tokens', 500)
        temperature = data.get('temperature', 0.7)
        stream = data.get('stream', False)

        if not ADAPTER:
            return json_response(
                {"error": "AI服务未配置，请联系管理员"}, 500)

        context_messages = []
        if space_id is not None:
            space_context = load_space_context(space_id, user['id'])
            if space_context is None:
                return json_response({"error": "空间不存在"}, 404)
            context_messages = space_context
            logger.info(f"加载了 {len(context_messages)} 条历史上下文")
        else:
            room_context = load_room_context(room_id)
            context_messages = room_context
            logger.info(f"按 room_id 加载了 {len(context_messages)} 条历史上下文 (room: {room_id})")

        augmented_messages = context_messages + messages

        system_message = None
        for msg in augmented_messages:
            if msg.get('role') == 'system':
                system_message = msg.get('content', '')
                break

        prompt_text_for_tokens = ""
        for msg in augmented_messages:
            c = msg.get('content', '')
            if isinstance(c, bytes):
                c = c.decode('utf-8')
            prompt_text_for_tokens += c
        required_tokens = calculate_tokens(prompt_text_for_tokens)

        check_result = check_concurrent_and_tokens(
            user['id'], user['api_key'], required_tokens, space_id)
        if not check_result['success']:
            return json_response({"error": check_result['error']}, 403)

        if stream:
            if not ADAPTER:
                return json_response({"error": "AI服务未配置，请联系管理员"}, 500)
            def generate():
                request_id = add_concurrent_request(user['id'], user['api_key'])
                try:
                    for event in ADAPTER.generate_sse_events(
                            augmented_messages, "qwen", max_tokens, temperature, system_message):
                        yield event
                finally:
                    remove_concurrent_request(request_id)
            return Response(generate(), mimetype='text/event-stream',
                          headers={
                              'Cache-Control': 'no-cache',
                              'X-Accel-Buffering': 'no',
                              'Connection': 'keep-alive'
                          })

        request_id = add_concurrent_request(user['id'], user['api_key'])

        try:
            logger.info(f"处理请求，消息数: {len(augmented_messages)}")
            response = ADAPTER.process_prompt(
                augmented_messages, "qwen", max_tokens, temperature, system_message)
            if "error" in response:
                logger.error(f"处理错误: {response['error']}")
                return json_response(response, 500)

            answer_text = response["choices"][0]["text"]
            total_used_tokens = response["usage"]["total_tokens"]

            deduct_result = deduct_tokens(user['id'], total_used_tokens, space_id)
            remaining_tokens = deduct_result['remaining_tokens']
            space_tokens = deduct_result['space_tokens']

            conn = get_db()
            conn.execute(
                "INSERT INTO api_usage_log (user_id, api_key, prompt_tokens, completion_tokens) "
                "VALUES (?, ?, ?, ?)",
                (user['id'], user['api_key'],
                 response['usage']['prompt_tokens'],
                 response['usage']['completion_tokens']))
            conn.commit()
            conn.close()

            if space_id is not None:
                for msg in messages:
                    if msg.get('role') in ('user', 'assistant', 'system'):
                        save_space_context(space_id, user['id'], msg['role'], msg['content'])
                save_space_context(space_id, user['id'], 'assistant', answer_text)
            else:
                for msg in messages:
                    if msg.get('role') in ('user', 'assistant', 'system'):
                        save_room_context(room_id, user['id'], msg['role'], msg['content'])
                save_room_context(room_id, user['id'], 'assistant', answer_text)

            logger.info(f"AI回答: {answer_text[:100]}...")
            warnings = []
            if remaining_tokens <= 10:
                warnings.append(f"Token即将用完，剩余仅{remaining_tokens}")
            if remaining_tokens <= 0:
                answer_text += "\n\n[Token已用完，输出已被截断，请及时补充Token]"
                warnings.append("Token已用完，后续请求将被拒绝")
            if user['remaining_tokens'] - total_used_tokens <= 0 and total_used_tokens > 0:
                warnings.append("本次请求已消耗全部剩余Token")
            chat_response = {
                "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
                "object": "chat.completion",
                "created": response["created"],
                "choices": [
                    {"index": 0,
                     "message": {"role": "assistant", "content": answer_text},
                     "finish_reason": "stop"}
                ],
                "usage": {
                    "prompt_tokens": response['usage']['prompt_tokens'],
                    "completion_tokens": response['usage']['completion_tokens'],
                    "total_tokens": total_used_tokens,
                    "use-token": total_used_tokens,
                    "token": remaining_tokens,
                    "space_tokens": space_tokens,
                    "context_messages": len(context_messages),
                    "context_type": ("space" if space_id is not None else "room")
                }
            }
            if warnings:
                chat_response["warning"] = "；".join(warnings)
            logger.info("=" * 60)
            return json_response(chat_response)
        finally:
            remove_concurrent_request(request_id)

    except Exception as e:
        logger.error(f"服务器错误: {str(e)}", exc_info=True)
        return json_response({"error": str(e)}, 500)


@app.route('/v1/completions', methods=['POST'])
def completions():
    client_ip = get_client_ip()
    user = authenticate_request()
    if not user:
        return json_response({"error": "请提供有效的认证凭证"}, 401)
    status_error = validate_user_status(user)
    if status_error:
        return status_error

    try:
        data = request.get_json()
        logger.info("=" * 60)
        logger.info("收到 /v1/completions 请求")
        prompt = data.get('prompt', '')
        model = data.get('model', 'qwen')
        max_tokens = data.get('max_tokens', 500)
        temperature = data.get('temperature', 0.7)
        if not prompt:
            return json_response({"error": "请输入您的问题"}, 400)
        if not ADAPTER:
            return json_response(
                {"error": "AI服务未配置，请联系管理员"}, 500)

        required_tokens = calculate_tokens(prompt)

        check_result = check_concurrent_and_tokens(
            user['id'], user['api_key'], required_tokens)
        if not check_result['success']:
            return json_response({"error": check_result['error']}, 403)

        request_id = add_concurrent_request(user['id'], user['api_key'])

        try:
            messages = [{"role": "user", "content": prompt}]
            response = ADAPTER.process_prompt(
                messages, model, max_tokens, temperature)
            if "error" in response:
                return json_response(response, 500)

            total_used_tokens = response["usage"]["total_tokens"]

            deduct_result = deduct_tokens(user['id'], total_used_tokens)
            remaining_tokens = deduct_result['remaining_tokens']

            warnings = []
            if remaining_tokens <= 10:
                warnings.append(f"Token即将用完，剩余仅{remaining_tokens}")
            if remaining_tokens <= 0:
                warnings.append("Token已用完，后续请求将被拒绝")

            conn = get_db()
            conn.execute(
                "INSERT INTO api_usage_log (user_id, api_key, prompt_tokens, completion_tokens) "
                "VALUES (?, ?, ?, ?)",
                (user['id'], user['api_key'],
                 response['usage']['prompt_tokens'],
                 response['usage']['completion_tokens']))
            conn.commit()
            conn.close()

            response["usage"]["use-token"] = total_used_tokens
            response["usage"]["token"] = remaining_tokens
            if warnings:
                response["warning"] = "；".join(warnings)

            return json_response(response)
        finally:
            remove_concurrent_request(request_id)
    except Exception as e:
        logger.error(f"服务器错误: {str(e)}")
        return json_response({"error": str(e)}, 500)


@app.route('/v1/models', methods=['GET'])
@require_auth
def list_models():
    models = {
        "object": "list",
        "data": [
            {"id": "qwen", "object": "model", "created": int(time.time()),
             "owned_by": "alibaba", "max_tokens": 4096, "name": "Qwen"},
            {"id": "qwen-7b-chat", "object": "model",
             "created": int(time.time()), "owned_by": "alibaba",
             "max_tokens": 4096, "name": "Qwen-7B-Chat"},
            {"id": "qwen-14b-chat", "object": "model",
             "created": int(time.time()), "owned_by": "alibaba",
             "max_tokens": 4096, "name": "Qwen-14B-Chat"},
            {"id": "qwen-max", "object": "model",
             "created": int(time.time()), "owned_by": "alibaba",
             "max_tokens": 4096, "name": "Qwen-Max"}
        ]
    }
    return json_response(models)


@app.route('/v1/calculate_tokens', methods=['POST'])
@require_auth
def calculate_tokens_api():
    try:
        data = request.get_json()
        text = data.get('text', '')
        tokens = calculate_tokens(text)
        return json_response({
            "text": text,
            "tokens": tokens,
            "characters": len(text),
            "model": "qwen"
        })
    except Exception as e:
        logger.error(f"计算token失败: {str(e)}")
        return json_response({"error": str(e)}, 500)


# ==================== 批处理管理API ====================


@app.route('/v1/batch/jobs', methods=['POST'])
def submit_batch_job():
    user = authenticate_request()
    if not user:
        return json_response({"error": "请提供有效的认证凭证"}, 401)
    if not ADAPTER:
        return json_response({"error": "AI服务未配置"}, 500)
    try:
        data = request.get_json()
        messages = data.get('messages', [])
        model = data.get('model', 'qwen')
        max_tokens = data.get('max_tokens', 500)
        temperature = data.get('temperature', 0.7)
        if not messages:
            return json_response({"error": "请提供 messages"}, 400)
        system_message = None
        for msg in messages:
            if msg.get('role') == 'system':
                system_message = msg.get('content', '')
                break
        job_id = ADAPTER.submit_job(
            messages, model, max_tokens, temperature,
            system_message, user_id=user['id'])
        return json_response({
            "job_id": job_id,
            "status": "queued",
            "message": "任务已提交，可通过 /v1/batch/jobs/{job_id} 查询状态"
        })
    except Exception as e:
        logger.error(f"提交批处理任务失败: {str(e)}")
        return json_response({"error": str(e)}, 500)


@app.route('/v1/batch/jobs', methods=['GET'])
def list_batch_jobs():
    user = authenticate_request()
    if not user:
        return json_response({"error": "请提供有效的认证凭证"}, 401)
    if not ADAPTER:
        return json_response({"error": "AI服务未配置"}, 500)
    try:
        limit = request.args.get('limit', 20, type=int)
        jobs = ADAPTER.list_jobs(limit=limit, user_id=user['id'])
        return json_response({
            "object": "list",
            "data": jobs
        })
    except Exception as e:
        logger.error(f"查询任务列表失败: {str(e)}")
        return json_response({"error": str(e)}, 500)


@app.route('/v1/batch/jobs/<job_id>', methods=['GET'])
def get_batch_job(job_id):
    user = authenticate_request()
    if not user:
        return json_response({"error": "请提供有效的认证凭证"}, 401)
    if not ADAPTER:
        return json_response({"error": "AI服务未配置"}, 500)
    try:
        job = ADAPTER.get_job(job_id)
        if not job:
            return json_response({"error": "任务不存在"}, 404)
        if job.get('user_id') and job['user_id'] != user['id']:
            return json_response({"error": "无权访问此任务"}, 403)
        return json_response(job)
    except Exception as e:
        logger.error(f"查询任务失败: {str(e)}")
        return json_response({"error": str(e)}, 500)


@app.route('/v1/batch/upload', methods=['POST'])
@require_admin
def upload_batch_file():
    if not ADAPTER:
        return json_response({"error": "AI服务未配置"}, 500)
    try:
        data = request.get_json()
        requests_data = data.get('requests', [])
        if not requests_data:
            return json_response({"error": "请提供 requests 列表"}, 400)
        result = ADAPTER.upload_and_batch(requests_data)
        if "error" in result:
            return json_response(result, 500)
        return json_response(result)
    except Exception as e:
        logger.error(f"上传批处理失败: {str(e)}")
        return json_response({"error": str(e)}, 500)


@app.route('/v1/batch/files', methods=['GET'])
@require_admin
def list_xfyun_files():
    if not ADAPTER:
        return json_response({"error": "AI服务未配置"}, 500)
    try:
        page = request.args.get('page', 1, type=int)
        size = request.args.get('size', 20, type=int)
        result = ADAPTER.list_files(page=page, size=size)
        if not result:
            return json_response({"error": "查询文件列表失败"}, 500)
        return json_response(result)
    except Exception as e:
        logger.error(f"查询文件列表失败: {str(e)}")
        return json_response({"error": str(e)}, 500)


@app.route('/v1/batch/files/<file_id>', methods=['GET'])
@require_admin
def get_xfyun_file(file_id):
    if not ADAPTER:
        return json_response({"error": "AI服务未配置"}, 500)
    try:
        result = ADAPTER.get_file_info(file_id)
        if not result:
            return json_response({"error": "文件不存在"}, 404)
        return json_response(result)
    except Exception as e:
        logger.error(f"查询文件信息失败: {str(e)}")
        return json_response({"error": str(e)}, 500)


@app.route('/v1/batch/files/<file_id>', methods=['DELETE'])
@require_admin
def delete_xfyun_file(file_id):
    if not ADAPTER:
        return json_response({"error": "AI服务未配置"}, 500)
    try:
        result = ADAPTER.delete_file(file_id)
        if not result:
            return json_response({"error": "删除文件失败"}, 500)
        return json_response(result)
    except Exception as e:
        logger.error(f"删除文件失败: {str(e)}")
        return json_response({"error": str(e)}, 500)


@app.route('/v1/batch/batches', methods=['GET'])
@require_admin
def list_xfyun_batches():
    if not ADAPTER:
        return json_response({"error": "AI服务未配置"}, 500)
    try:
        limit = request.args.get('limit', 10, type=int)
        after = request.args.get('after', None)
        result = ADAPTER.list_batches(limit=limit, after=after)
        if not result:
            return json_response({"error": "查询批处理列表失败"}, 500)
        return json_response(result)
    except Exception as e:
        logger.error(f"查询批处理列表失败: {str(e)}")
        return json_response({"error": str(e)}, 500)


@app.route('/v1/batch/batches/<batch_id>', methods=['GET'])
@require_admin
def get_xfyun_batch_status(batch_id):
    if not ADAPTER:
        return json_response({"error": "AI服务未配置"}, 500)
    try:
        result = ADAPTER._get_batch_status(batch_id)
        if not result:
            return json_response({"error": "查询批处理状态失败"}, 500)
        return json_response(result)
    except Exception as e:
        logger.error(f"查询批处理状态失败: {str(e)}")
        return json_response({"error": str(e)}, 500)


@app.route('/v1/batch/batches/<batch_id>/results', methods=['GET'])
@require_admin
def get_xfyun_batch_results(batch_id):
    if not ADAPTER:
        return json_response({"error": "AI服务未配置"}, 500)
    try:
        result = ADAPTER._get_batch_results(batch_id)
        if not result:
            return json_response({"error": "查询批处理结果失败"}, 500)
        return json_response(result)
    except Exception as e:
        logger.error(f"查询批处理结果失败: {str(e)}", exc_info=True)
        return json_response({"error": str(e)}, 500)


@app.route('/v1/batch/batches/<batch_id>/cancel', methods=['POST'])
@require_admin
def cancel_xfyun_batch(batch_id):
    if not ADAPTER:
        return json_response({"error": "AI服务未配置"}, 500)
    try:
        result = ADAPTER.cancel_batch(batch_id)
        if not result:
            return json_response({"error": "取消批处理失败"}, 500)
        return json_response(result)
    except Exception as e:
        logger.error(f"取消批处理失败: {str(e)}")
        return json_response({"error": str(e)}, 500)


# ==================== SSE 实时推送 ====================

_batch_sse_clients = set()
_batch_sse_lock = threading.Lock()


@app.route('/v1/batch/events')
def batch_sse():
    token = request.args.get('token', '')
    auth_header = request.headers.get('Authorization', '')
    if not token and auth_header.startswith('Bearer '):
        token = auth_header[7:]
    if not token:
        return json_response({"error": "未提供认证Token"}, 401)
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE api_key = ?", (token,)).fetchone()
    conn.close()
    if not user or user['role'] != 'admin':
        return json_response({"error": "未授权"}, 401)

    def generate():
        last_batches_hash = ''
        last_files_hash = ''
        def _hash(data):
            return hashlib.md5(json.dumps(data, sort_keys=True, default=str, ensure_ascii=False).encode()).hexdigest()
        try:
            batches = ADAPTER.list_batches()
            if batches:
                last_batches_hash = _hash(batches)
                yield f"event: batches_updated\ndata: {json.dumps(batches, ensure_ascii=False)}\n\n"
            files = ADAPTER.list_files()
            if files:
                last_files_hash = _hash(files)
                yield f"event: files_updated\ndata: {json.dumps(files, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error(f"SSE 初始数据推送失败: {e}")
        while True:
            try:
                time.sleep(2)
                batches = ADAPTER.list_batches()
                if batches:
                    h = _hash(batches)
                    if h != last_batches_hash:
                        last_batches_hash = h
                        yield f"event: batches_updated\ndata: {json.dumps(batches, ensure_ascii=False)}\n\n"
                files = ADAPTER.list_files()
                if files:
                    h = _hash(files)
                    if h != last_files_hash:
                        last_files_hash = h
                        yield f"event: files_updated\ndata: {json.dumps(files, ensure_ascii=False)}\n\n"
                yield ": heartbeat\n\n"
            except GeneratorExit:
                break
            except Exception as e:
                logger.error(f"SSE 轮询异常: {e}")
                yield f"event: error\ndata: {json.dumps({'message': str(e)}, ensure_ascii=False)}\n\n"
    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
    })


@app.route('/health', methods=['GET'])
def health_check():
    return json_response({
        "status": "ok",
        "timestamp": time.time()
    })


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path and os.path.exists(os.path.join(FRONTEND_DIST, path)):
        return send_from_directory(FRONTEND_DIST, path)
    index_path = os.path.join(FRONTEND_DIST, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(FRONTEND_DIST, 'index.html')
    return json_response({
        "message": "DingDang Cloud - 千问API适配器管理平台",
        "status": "running",
        "hint": "前端页面未构建，请运行 cd frontend && npm run build"
    })


# ==================== Proxy Protocol v2 支持 ====================

import socket as _pp_socket
import struct as _pp_struct

_PP_V2_SIGNATURE = b'\x0D\x0A\x0D\x0A\x00\x0D\x0A\x51\x55\x49\x54\x0A'


def _parse_pp_v2_header(data: bytes):
    if len(data) < 16 or data[:12] != _PP_V2_SIGNATURE:
        return None
    addr_len = _pp_struct.unpack('!H', data[14:16])[0]
    if len(data) < 16 + addr_len:
        return None
    block = data[16:16 + addr_len]
    family = data[13] >> 4
    if family == 1:
        ip = _pp_socket.inet_ntop(_pp_socket.AF_INET, block[:4])
        port = _pp_struct.unpack('!H', block[8:10])[0]
        return (ip, port)
    if family == 2:
        ip = _pp_socket.inet_ntop(_pp_socket.AF_INET6, block[:16])
        port = _pp_struct.unpack('!H', block[32:34])[0]
        return (ip, port)
    return None


def _create_proxy_protocol_server(host, port, wsgi_app):
    from werkzeug.serving import ThreadedWSGIServer, WSGIRequestHandler

    class _PPHandler(WSGIRequestHandler):

        def address_string(self):
            pp_ip = getattr(self.connection, '_pp_real_ip', None)
            if pp_ip:
                return pp_ip
            return super().address_string()

        def make_environ(self):
            env = super().make_environ()
            pp_ip = getattr(self.connection, '_pp_real_ip', None)
            if pp_ip:
                env['REMOTE_ADDR'] = pp_ip
                env['REMOTE_PORT'] = str(getattr(self.connection, '_pp_real_port',
                    env.get('REMOTE_PORT', '0')))
                env['HTTP_X_REAL_IP'] = pp_ip
                env['HTTP_X_FORWARDED_FOR'] = pp_ip
            return env

    class _PPThreadedServer(ThreadedWSGIServer):
        allow_reuse_address = True

        def get_request(self):
            sock, addr = super().get_request()
            try:
                peek = sock.recv(16, _pp_socket.MSG_PEEK)
                if len(peek) >= 16 and peek[:12] == _PP_V2_SIGNATURE:
                    total = 16 + _pp_struct.unpack('!H', peek[14:16])[0]
                    raw = sock.recv(total)
                    parsed = _parse_pp_v2_header(raw)
                    if parsed:
                        addr = parsed
                        sock._pp_real_ip = parsed[0]
                        sock._pp_real_port = parsed[1]
                elif peek:
                    pass
            except Exception:
                pass
            return sock, addr

    return _PPThreadedServer(host, port, wsgi_app, handler=_PPHandler)


if __name__ == "__main__":
    init_db()
    print("=" * 60)
    print("  DingDang Cloud v3.2")
    print("=" * 60)
    print()
    print("  AI接口适配器管理平台")
    print()
    print("  配置信息:")
    print(f"  Base URL: http://{CFG['app']['host']}:{CFG['app']['port']}")
    print()
    if not CFG['api']['xfyun_password']:
        print("  [提示] 讯飞API密码未配置")
        print("  请通过环境变量 YML_XFYUN_PASSWORD 设置")
        print()
    if not CFG['smtp']['password']:
        print("  [提示] SMTP密码未配置")
        print("  请通过环境变量 YML_SMTP_PASSWORD 设置")
        print("  未配置时将使用开发模式（验证码打印到日志）")
        print()
    print("  启动服务...")
    print("=" * 60)

    proxy_version = CFG['app'].get('proxy_protocol_version', 0)
    if proxy_version == 2:
        print(f"  Proxy Protocol v{proxy_version} (socket级) 已启用")
        print()
        server = _create_proxy_protocol_server(
            CFG['app']['host'], CFG['app']['port'], app)
        server.serve_forever()
    else:
        if proxy_version == 1:
            print(f"  Proxy Protocol v{proxy_version} (HTTP头部) 已启用")
            print()

        from werkzeug.serving import WSGIRequestHandler

        class RealIPLogHandler(WSGIRequestHandler):

            def address_string(self):
                forwarded = self.headers.get('X-Forwarded-For')
                if forwarded:
                    ip = forwarded.split(',')[0].strip()
                    if is_valid_ip(ip):
                        return ip
                return super().address_string()

        def run_cleanup_scheduler():
            while True:
                try:
                    time.sleep(3600)
                    cleanup_old_notifications()
                except Exception:
                    pass

        cleanup_thread = threading.Thread(
            target=run_cleanup_scheduler, daemon=True)
        cleanup_thread.start()

        app.run(host=CFG['app']['host'], port=CFG['app']['port'],
                debug=False, threaded=True, request_handler=RealIPLogHandler)