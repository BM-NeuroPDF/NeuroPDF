#!/usr/bin/env python3
"""
Supabase üzerinden user_roles tablosunu kontrol edip eksik rolleri ekler.
"""

import sys
import os

# Backend dizinini path'e ekle
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.config import settings
from supabase import create_client, Client
import httpx

def get_supabase() -> Client:
    """Supabase client'ı döndürür."""
    try:
        return create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_KEY,
            options={
                "http_client": httpx.Client(verify=False)
            }
        )
    except Exception:
        # Eğer yukarıdaki yöntem çalışmazsa, basit versiyonu dene
        return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

def fix_user_roles():
    """user_roles tablosunu kontrol edip eksik rolleri ekler."""
    
    supabase = get_supabase()
    
    # Mevcut rolleri kontrol et
    try:
        result = supabase.table("user_roles").select("id, name").order("id").execute()
        existing_roles = {row["id"]: row["name"] for row in result.data}
        
        print("Mevcut roller:")
        for role_id, role_name in sorted(existing_roles.items()):
            print(f"  ID {role_id}: {role_name}")
    except Exception as e:
        print(f"⚠️  Roller okunamadı: {e}")
        existing_roles = {}
    
    # Eksik rolleri ekle
    roles_to_add = [
        {"id": 0, "name": "default user"},
        {"id": 1, "name": "pro user"},
        {"id": 2, "name": "admin"},
    ]
    
    print("\n" + "="*50)
    for role_data in roles_to_add:
        role_id = role_data["id"]
        role_name = role_data["name"]
        
        if role_id not in existing_roles:
            print(f"✅ Eksik rol ekleniyor: ID {role_id} = '{role_name}'")
            try:
                supabase.table("user_roles").insert(role_data).execute()
                print(f"   ✓ Rol başarıyla eklendi!")
            except Exception as e:
                print(f"   ✗ Hata: {e}")
        elif existing_roles[role_id] != role_name:
            print(f"⚠️  Rol adı farklı: ID {role_id} = '{existing_roles[role_id]}' (beklenen: '{role_name}')")
            print(f"   🔄 Rol güncelleniyor...")
            try:
                supabase.table("user_roles").update({"name": role_name}).eq("id", role_id).execute()
                print(f"   ✓ Rol başarıyla güncellendi!")
            except Exception as e:
                print(f"   ✗ Güncelleme hatası: {e}")
        else:
            print(f"✓ Rol mevcut: ID {role_id} = '{role_name}'")
    
    # Son durumu göster
    print("\n" + "="*50)
    print("Güncel roller:")
    try:
        result = supabase.table("user_roles").select("id, name").order("id").execute()
        for row in result.data:
            print(f"  ID {row['id']}: {row['name']}")
    except Exception as e:
        print(f"❌ Roller okunamadı: {e}")

if __name__ == "__main__":
    try:
        fix_user_roles()
        print("\n✅ İşlem tamamlandı!")
    except Exception as e:
        print(f"\n❌ Hata: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
