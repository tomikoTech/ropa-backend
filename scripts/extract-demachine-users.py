#!/usr/bin/env python3
"""
Saca de demachine los usuarios, los roles y quién tiene qué.

Por qué raspar HTML y no llamar a una API: no hay. `/api/users/*` responde 500
en las dos instancias; los listados de administración son páginas de CakePHP
renderizadas en el servidor con la tabla ya dentro del HTML.

Lo que trae, de cuatro pantallas:
  /Users/index       usuarios (código, nombre, correo, estado, tipo)
  /Roles/index       roles de la instancia
  /Userrol/index     qué roles tiene cada usuario — en demachine son varios
  /Userbodega/index  a qué bodegas entra cada usuario

Ojo: `Userrol` y `Userbodega` cruzan por **nombre** de usuario y de bodega, no
por id. Es lo único que publica esa pantalla.

Las contraseñas no salen (están hasheadas): el importador crea las cuentas
nuevas con una temporal y la imprime.

Uso:
  python3 scripts/extract-demachine-users.py sportcali Cesar 'la-clave' > out.json
  DEMACHINE_PASS='la-clave' python3 scripts/extract-demachine-users.py amawad AMAWAD
"""
import html as htmllib
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import http.cookiejar

TIMEOUT = 60
MAX_PAGINAS = 60


def abrir_sesion(base, usuario, clave):
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    datos = urllib.parse.urlencode({"name": usuario, "password": clave}).encode()
    op.open(f"{base}/login", data=datos, timeout=TIMEOUT).read()
    return op


def limpiar(celda):
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", celda))).strip()


def filas_de_datos(pagina):
    """
    Las filas del listado, con su id.

    La tabla de datos es la **última** con `<tbody>`: las de arriba son
    plantillas de los modales y traen literales de JavaScript, no datos.
    """
    cuerpos = re.findall(r"<tbody[^>]*>(.*?)</tbody>", pagina, re.S)
    if not cuerpos:
        return []
    filas = []
    for ident, cuerpo in re.findall(
        r'<tr[^>]*id="(\d+)"[^>]*>(.*?)</tr>', cuerpos[-1], re.S
    ):
        celdas = [limpiar(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", cuerpo, re.S)]
        filas.append((ident, celdas))
    return filas


def listar(op, base, ruta):
    """Recorre la paginación del listado hasta la última página."""
    todas = []
    for page in range(1, MAX_PAGINAS + 1):
        sep = "&" if "?" in ruta else "?"
        try:
            pagina = op.open(f"{base}{ruta}{sep}page={page}", timeout=TIMEOUT)
            pagina = pagina.read().decode("utf-8", "replace")
        except Exception as e:
            print(f"  aviso: {ruta} page={page}: {e}", file=sys.stderr)
            break
        filas = filas_de_datos(pagina)
        if not filas:
            break
        todas.extend(filas)
        # «Pagina 1 de 3 de 57 Registros». Sin ese texto no hay más páginas.
        m = re.search(r"Pagina\s+(\d+)\s+de\s+(\d+)", pagina)
        if not m or int(m.group(1)) >= int(m.group(2)):
            break
    return todas


def extraer(instancia, usuario, clave):
    base = f"https://{instancia}.demachine.co"
    op = abrir_sesion(base, usuario, clave)

    usuarios = [
        {
            "id": int(ident),
            "codigo": c[0] if len(c) > 0 else "",
            "nombre": c[1] if len(c) > 1 else "",
            "email": c[2] if len(c) > 2 else "",
            "creado": c[4] if len(c) > 4 else "",
        }
        for ident, c in listar(op, base, "/Users/index")
    ]
    roles = [
        {
            "id": int(ident),
            "clave": c[1] if len(c) > 1 else "",
            "nombre": (c[2] if len(c) > 2 else c[1] if len(c) > 1 else ""),
        }
        for ident, c in listar(op, base, "/Roles/index")
    ]
    # Cruzan por nombre: es lo único que publica la pantalla.
    usuario_rol = [
        {"usuario": c[0], "rol": c[1]}
        for _, c in listar(op, base, "/Userrol/index")
        if len(c) >= 2
    ]
    usuario_bodega = [
        {"usuario": c[0], "bodega": c[1]}
        for _, c in listar(op, base, "/Userbodega/index")
        if len(c) >= 2
    ]

    return {
        "instancia": instancia,
        "usuarios": usuarios,
        "roles": roles,
        "usuario_rol": usuario_rol,
        "usuario_bodega": usuario_bodega,
    }


def main():
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    instancia, usuario = sys.argv[1], sys.argv[2]
    clave = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("DEMACHINE_PASS", "")
    if not clave:
        print("Falta la contraseña (argumento 3 o DEMACHINE_PASS)", file=sys.stderr)
        sys.exit(2)
    datos = extraer(instancia, usuario, clave)
    print(
        f"{instancia}: {len(datos['usuarios'])} usuarios, {len(datos['roles'])} roles, "
        f"{len(datos['usuario_rol'])} asignaciones de rol, "
        f"{len(datos['usuario_bodega'])} de bodega",
        file=sys.stderr,
    )
    json.dump(datos, sys.stdout, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
