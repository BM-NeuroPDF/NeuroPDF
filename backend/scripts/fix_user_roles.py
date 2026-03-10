#!/usr/bin/env python3
"""
Veritabanındaki user_roles tablosunu kontrol edip eksik rolleri ekler.
Migration'da "pro user" olarak eklenmiş ama frontend "Pro" bekliyor olabilir.
"""

import sys
import os

# Backend dizinini path'e ekle
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import text
from app.db import engine, get_db

def fix_user_roles():
    """user_roles tablosunu kontrol edip eksik rolleri ekler."""
    
    with engine.connect() as conn:
        # Mevcut rolleri kontrol et
        result = conn.execute(text("SELECT id, name FROM user_roles ORDER BY id"))
        existing_roles = {row[0]: row[1] for row in result}
        
        print("Mevcut roller:")
        for role_id, role_name in existing_roles.items():
            print(f"  ID {role_id}: {role_name}")
        
        # Eksik rolleri ekle
        roles_to_add = [
            (0, "default user"),
            (1, "pro user"),
            (2, "admin"),
        ]
        
        for role_id, role_name in roles_to_add:
            if role_id not in existing_roles:
                print(f"\n✅ Eksik rol ekleniyor: ID {role_id} = '{role_name}'")
                try:
                    conn.execute(
                        text("INSERT INTO user_roles (id, name) VALUES (:id, :name)"),
                        {"id": role_id, "name": role_name}
                    )
                    conn.commit()
                    print(f"   ✓ Rol başarıyla eklendi!")
                except Exception as e:
                    print(f"   ✗ Hata: {e}")
                    conn.rollback()
            elif existing_roles[role_id] != role_name:
                print(f"\n⚠️  Rol adı farklı: ID {role_id} = '{existing_roles[role_id]}' (beklenen: '{role_name}')")
                # İsterseniz güncelleyebilirsiniz
                # conn.execute(
                #     text("UPDATE user_roles SET name = :name WHERE id = :id"),
                #     {"id": role_id, "name": role_name}
                # )
        
        # Son durumu göster
        print("\n" + "="*50)
        print("Güncel roller:")
        result = conn.execute(text("SELECT id, name FROM user_roles ORDER BY id"))
        for row in result:
            print(f"  ID {row[0]}: {row[1]}")

if __name__ == "__main__":
    try:
        fix_user_roles()
        print("\n✅ İşlem tamamlandı!")
    except Exception as e:
        print(f"\n❌ Hata: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
