"""
AES-256-GCM application-level encryption for sensitive fields stored in the DB.

The plaintext NEVER enters the database; only opaque base64-encoded ciphertext is
stored.  The encryption key lives exclusively in the environment — never in source
control or the database.

Generate a key once and store it as CREDENTIAL_ENCRYPTION_KEY:
    python3 -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"

Usage:
    from app.core.crypto import encrypt_field, decrypt_field

    stored  = encrypt_field("my-secret-password")   # store this in DB
    original = decrypt_field(stored)                 # call when you need it
"""

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Module-level key cache — loaded once, validated at startup.
_KEY: bytes | None = None


def _get_key() -> bytes:
    global _KEY
    if _KEY is not None:
        return _KEY

    # pydantic-settings reads .env but does NOT inject into os.environ, so we
    # must go through get_settings() rather than os.environ.get() directly.
    from app.core.config import get_settings  # local import avoids circular deps
    raw = get_settings().CREDENTIAL_ENCRYPTION_KEY or os.environ.get("CREDENTIAL_ENCRYPTION_KEY", "")
    if not raw:
        raise RuntimeError(
            "CREDENTIAL_ENCRYPTION_KEY is not set. "
            "Generate one with:\n"
            "  python3 -c \"import secrets, base64; "
            "print(base64.b64encode(secrets.token_bytes(32)).decode())\""
        )

    try:
        key = base64.b64decode(raw)
    except Exception:
        raise RuntimeError("CREDENTIAL_ENCRYPTION_KEY is not valid base64")

    if len(key) != 32:
        raise RuntimeError(
            f"CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes "
            f"(got {len(key)})"
        )

    _KEY = key
    return _KEY


def encrypt_field(plaintext: str) -> str:
    """
    Encrypt *plaintext* with AES-256-GCM.

    Returns a base64-encoded string that packs:
        12-byte random nonce || ciphertext || 16-byte GCM authentication tag

    A fresh nonce is generated on every call — safe to call multiple times with
    the same key without nonce reuse.
    """
    key = _get_key()
    nonce = os.urandom(12)  # 96-bit nonce is the GCM recommendation
    aesgcm = AESGCM(key)
    # AESGCM.encrypt returns ciphertext + 16-byte tag appended
    ct_and_tag = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ct_and_tag).decode("ascii")


def decrypt_field(ciphertext_b64: str) -> str:
    """
    Decrypt a value produced by *encrypt_field*.

    Raises ``ValueError`` if the ciphertext is tampered with or the key is wrong
    (AESGCM raises ``cryptography.exceptions.InvalidTag`` which we re-raise as
    ``ValueError`` so callers don't need to import cryptography internals).
    """
    key = _get_key()
    try:
        raw = base64.b64decode(ciphertext_b64)
    except Exception as exc:
        raise ValueError("Ciphertext is not valid base64") from exc

    if len(raw) < 12 + 16:  # nonce + minimum 1 byte plaintext + 16-byte tag
        raise ValueError("Ciphertext is too short to be valid")

    nonce, ct_and_tag = raw[:12], raw[12:]
    aesgcm = AESGCM(key)
    try:
        plaintext_bytes = aesgcm.decrypt(nonce, ct_and_tag, None)
    except Exception as exc:
        raise ValueError(
            "Decryption failed — wrong key or ciphertext has been tampered with"
        ) from exc

    return plaintext_bytes.decode("utf-8")
