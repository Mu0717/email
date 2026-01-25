import sqlite3
import json
import logging
import asyncio
from pathlib import Path
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)

# 确保data目录存在
DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

DB_FILE = DATA_DIR / "emails.db"
JSON_FILE = "accounts.json"

def get_db_connection():
    conn = sqlite3.connect(str(DB_FILE))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS accounts (
            email TEXT PRIMARY KEY,
            password TEXT DEFAULT '',
            refresh_token TEXT NOT NULL,
            client_id TEXT NOT NULL,
            is_sold INTEGER DEFAULT 0,
            remark TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()
    
    check_and_migrate_schema()
    migrate_from_json()

def check_and_migrate_schema():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(accounts)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'password' not in columns:
            logger.info("Adding 'password' column to accounts table")
            cursor.execute("ALTER TABLE accounts ADD COLUMN password TEXT DEFAULT ''")
        
        if 'is_sold' not in columns:
            logger.info("Adding 'is_sold' column to accounts table")
            cursor.execute("ALTER TABLE accounts ADD COLUMN is_sold INTEGER DEFAULT 0")
            
        if 'remark' not in columns:
            logger.info("Adding 'remark' column to accounts table")
            cursor.execute("ALTER TABLE accounts ADD COLUMN remark TEXT DEFAULT ''")
            
        conn.commit()
    except Exception as e:
        logger.error(f"Schema migration failed: {e}")
    finally:
        conn.close()

def migrate_from_json():
    if not Path(JSON_FILE).exists():
        return
    
    logger.info("Starting migration from JSON to SQLite...")
    try:
        with open(JSON_FILE, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                return # Empty or invalid file

        if not data:
            return

        conn = get_db_connection()
        c = conn.cursor()
        
        count = 0
        for email, info in data.items():
            try:
                # Also try to retrieve metadata from local storage simulation if stored in json?
                # Assuming JSON only had credentials.
                c.execute('''
                    INSERT OR IGNORE INTO accounts (email, refresh_token, client_id)
                    VALUES (?, ?, ?)
                ''', (email, info['refresh_token'], info['client_id']))
                count += 1
            except Exception as e:
                logger.error(f"Failed to migrate {email}: {e}")
                
        conn.commit()
        conn.close()
        
        if count > 0:
            logger.info(f"Migrated {count} accounts from JSON to SQLite")
            # Rename json file to bak
            bak_file = f"{JSON_FILE}.bak"
            if Path(bak_file).exists():
                Path(bak_file).unlink()
            Path(JSON_FILE).rename(bak_file)
            logger.info(f"Renamed {JSON_FILE} to {bak_file}")
            
    except Exception as e:
        logger.error(f"Migration failed: {e}")

# ============================================================================
# Synchronous DB Operations
# ============================================================================

def _get_account_sync(email: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        row = conn.execute('SELECT * FROM accounts WHERE email = ?', (email,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def _get_accounts_filtered_sync(search_query: Optional[str] = None, filter_type: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        sql = 'SELECT * FROM accounts'
        conditions = []
        params = []
        
        # Search filter (email or remark)
        if search_query:
            conditions.append('(email LIKE ? OR remark LIKE ?)')
            params.append(f'%{search_query}%')
            params.append(f'%{search_query}%')
            
        # Status/Type filter
        if filter_type == 'sold':
            conditions.append('is_sold = 1')
        elif filter_type == 'unsold':
            conditions.append('is_sold = 0')
        # Note: 'active'/'inactive' are runtime checks, generally not filtered in DB unless persisted
            
        if conditions:
            sql += ' WHERE ' + ' AND '.join(conditions)
            
        sql += ' ORDER BY email'
        
        rows = conn.execute(sql, params).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

def _get_all_accounts_sync() -> List[Dict[str, Any]]:
    # Maintain backward compatibility or redirect to filtered
    return _get_accounts_filtered_sync()

def _upsert_account_sync(email: str, refresh_token: str, client_id: str, password: str = ''):
    conn = get_db_connection()
    try:
        # 更新凭证和密码，保留原有的 is_sold 和 remark
        conn.execute('''
            INSERT INTO accounts (email, password, refresh_token, client_id, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(email) DO UPDATE SET
                password=excluded.password,
                refresh_token=excluded.refresh_token,
                client_id=excluded.client_id,
                updated_at=CURRENT_TIMESTAMP
        ''', (email, password, refresh_token, client_id))
        conn.commit()
    finally:
        conn.close()

def _update_account_metadata_sync(email: str, is_sold: Optional[bool] = None, remark: Optional[str] = None):
    conn = get_db_connection()
    try:
        updates = []
        params = []
        if is_sold is not None:
            updates.append("is_sold = ?")
            params.append(1 if is_sold else 0)
        
        if remark is not None:
            updates.append("remark = ?")
            params.append(remark)
            
        if not updates:
            return

        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(email)
        
        sql = f"UPDATE accounts SET {', '.join(updates)} WHERE email = ?"
        conn.execute(sql, params)
        conn.commit()
    finally:
        conn.close()

def _delete_accounts_sync(emails: List[str]) -> int:
    conn = get_db_connection()
    try:
        placeholders = ','.join('?' for _ in emails)
        if not emails:
            return 0
        cursor = conn.execute(f'DELETE FROM accounts WHERE email IN ({placeholders})', emails)
        deleted_count = cursor.rowcount
        conn.commit()
        return deleted_count
    finally:
        conn.close()

# ============================================================================
# Async Wrappers
# ============================================================================

async def get_account(email: str) -> Optional[Dict[str, Any]]:
    return await asyncio.to_thread(_get_account_sync, email)

async def get_all_accounts() -> List[Dict[str, Any]]:
    return await asyncio.to_thread(_get_all_accounts_sync)

async def get_accounts_filtered(search_query: Optional[str] = None, filter_type: Optional[str] = None) -> List[Dict[str, Any]]:
    return await asyncio.to_thread(_get_accounts_filtered_sync, search_query, filter_type)

async def save_account(email: str, refresh_token: str, client_id: str, password: str = ''):
    await asyncio.to_thread(_upsert_account_sync, email, refresh_token, client_id, password)

async def update_account_metadata(email: str, is_sold: Optional[bool] = None, remark: Optional[str] = None):
    await asyncio.to_thread(_update_account_metadata_sync, email, is_sold, remark)

async def save_accounts_batch(accounts_list: List[Dict[str, str]]):
    # Reuse single upsert or optimize with batch insert if needed. 
    # For now, executing in thread is fine, but we can do a batch transaction.
    def _batch_save():
        conn = get_db_connection()
        try:
            for acc in accounts_list:
                # 更新凭证和密码
                password = acc.get('password', '')
                conn.execute('''
                    INSERT INTO accounts (email, password, refresh_token, client_id, updated_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(email) DO UPDATE SET
                        password=excluded.password,
                        refresh_token=excluded.refresh_token,
                        client_id=excluded.client_id,
                        updated_at=CURRENT_TIMESTAMP
                ''', (acc['email'], password, acc['refresh_token'], acc['client_id']))
            conn.commit()
        finally:
            conn.close()
            
    await asyncio.to_thread(_batch_save)

async def delete_accounts(emails: List[str]) -> int:
    return await asyncio.to_thread(_delete_accounts_sync, emails)
