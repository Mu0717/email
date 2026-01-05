import os
from passlib.context import CryptContext

# ============================================================================
# 安全配置常量
# ============================================================================

# 管理密码配置
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")  # 建议在生产环境中通过环境变量设置

# 密码哈希配置
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ============================================================================
# 密码验证函数
# ============================================================================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """生成密码哈希"""
    return pwd_context.hash(password)

def verify_admin_password(password: str) -> bool:
    """验证管理员密码"""
    # 如果ADMIN_PASSWORD以$2b$开头，说明是已经哈希过的密码
    if ADMIN_PASSWORD.startswith("$2b$"):
        return verify_password(password, ADMIN_PASSWORD)
    else:
        # 明文密码比较（不推荐用于生产环境）
        return password == ADMIN_PASSWORD

# ============================================================================
# 配置信息
# ============================================================================

def get_config_info() -> dict:
    """获取配置信息（不包含敏感数据）"""
    return {
        "auth_type": "bearer_password",
        "password_hashed": ADMIN_PASSWORD.startswith("$2b$")
    } 