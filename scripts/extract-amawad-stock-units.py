#!/usr/bin/env python3
"""Extractor read-only del CSV oficial de códigos físicos de AMAWAD."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from http.cookiejar import CookieJar
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(
    os.environ.get("OUTPUT_DIR", ROOT.parent / "migracion-amawad" / "out")
).resolve()
PAYLOAD = Path(
    os.environ.get("CATALOG_PAYLOAD", OUT / "payload.json")
).resolve()
BASE = os.environ.get("DEMACHINE_BASE", "https://amawad.demachine.co").rstrip("/")
USER = os.environ.get("DEMACHINE_USER", "AMAWAD")
PASSWORD = os.environ.get("DEMACHINE_PASSWORD", "AMAWAD2026")


def clean(value: object) -> str:
    return str(value or "").strip()


def barcode(value: object) -> str:
    raw = clean(value)
    if raw.startswith('="') and raw.endswith('"'):
        return raw[2:-1]
    return raw


def number(value: object) -> float:
    raw = clean(value).replace(",", ".")
    return float(raw) if raw else 0.0


def source_product_map() -> tuple[dict[str, list[dict]], dict[str, list[dict]]]:
    if not PAYLOAD.exists():
        raise RuntimeError(f"Falta el catálogo base: {PAYLOAD}")
    products = json.loads(PAYLOAD.read_text(encoding="utf-8"))["products"]
    by_code: dict[str, list[dict]] = defaultdict(list)
    by_name: dict[str, list[dict]] = defaultdict(list)
    for product in products:
        by_code[clean(product.get("code"))].append(product)
        by_name[clean(product.get("name"))].append(product)
    return by_code, by_name


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    login_data = urllib.parse.urlencode({"name": USER, "password": PASSWORD}).encode()
    login = opener.open(f"{BASE}/login", data=login_data, timeout=30)
    if login.geturl().rstrip("/").endswith("/login"):
        raise RuntimeError("demachine rechazó las credenciales")

    with opener.open(f"{BASE}/stocks/exportindex3", timeout=60) as response:
        raw = response.read()
    decoded = raw.decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(decoded), delimiter=";"))
    by_code, by_name = source_product_map()
    normalized: list[dict] = []
    seen: set[str] = set()
    duplicate_barcodes: list[str] = []

    for line, row in enumerate(rows, start=2):
        code = clean(row.get("CODIGO PRODUCTO"))
        name = clean(row.get("PRODUCTO"))
        code_matches = by_code.get(code, []) if code else []
        name_matches = by_name.get(name, []) if name else []
        matches = code_matches if len(code_matches) == 1 else name_matches
        physical_code = barcode(row.get("BARCODE"))
        if physical_code in seen:
            duplicate_barcodes.append(physical_code)
        seen.add(physical_code)
        normalized.append(
            {
                "line": line,
                "barcode": physical_code,
                "legacy_order_id": clean(row.get("PEDIDO ID")) or None,
                "warehouse": clean(row.get("BODEGA")),
                "shelf": clean(row.get("ESTANTERIA")) or None,
                "stand": clean(row.get("STAND")) or None,
                "size": clean(row.get("TALLA")) or None,
                "product_name": name,
                "product_code": code or None,
                "product_source_id": matches[0]["source_id"]
                if len(matches) == 1
                else None,
                "product_match_count": len(matches),
                "product_type": clean(row.get("TIPO PRODUCTO")) or None,
                "color": clean(row.get("COLOR")) or None,
                "cost": number(row.get("COSTO")),
                "quantity": int(number(row.get("CANTIDAD"))),
                "price": number(row.get("PRECIO")),
                "status": clean(row.get("ESTADO")),
                "product_active": clean(row.get("PRODUCTO ACTIVO / INACTIVO")),
                "created_at": clean(row.get("CREACION")) or None,
            }
        )

    checksum = hashlib.sha256(raw).hexdigest()
    document = {
        "meta": {
            "source": "demachine:amawad:stocks/exportindex3",
            "extracted_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "sha256": checksum,
            "rows": len(normalized),
            "physical_quantity": sum(row["quantity"] for row in normalized),
            "duplicate_barcodes": sorted(set(duplicate_barcodes)),
            "unmapped_products": sum(
                1 for row in normalized if row["product_source_id"] is None
            ),
        },
        "stock_units": normalized,
    }
    (OUT / "stock-units.csv").write_bytes(raw)
    (OUT / "stock-units.json").write_text(
        json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(document["meta"], ensure_ascii=False, indent=2))
    print(f"CSV:  {OUT / 'stock-units.csv'}")
    print(f"JSON: {OUT / 'stock-units.json'}")


if __name__ == "__main__":
    main()
