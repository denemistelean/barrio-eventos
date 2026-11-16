# Barra de eventos (Vercel + Postgres)

Sistema móvil de stock y ventas por evento, con login y roles (admin y ventas).

## Base de datos "en el mismo servidor"
Vercel es serverless y no tiene disco persistente, así que la base no puede vivir dentro del servidor.
Lo más cercano: crear **Neon Postgres desde el propio panel de Vercel**. Se conecta con un clic y
Vercel inyecta `DATABASE_URL` solo. Las tablas se crean solas en la primera petición.

## Despliegue
1. Sube esta carpeta a un repositorio de GitHub.
2. En Vercel: **Add New > Project** e importa el repositorio (sin framework, sin build).
3. En el proyecto: **Storage > Create Database > Neon** y conéctala a este proyecto.
4. En **Settings > Environment Variables** agrega `AUTH_SECRET` (texto largo aleatorio).
   Opcional: `ADMIN_USER` y `ADMIN_PASSWORD` (solo se usan para crear el admin la primera vez).
5. **Redeploy**. Entra con `admin` y la clave inicial, y cámbiala desde Cuenta.

Alternativa por consola: `npm i -g vercel`, luego `vercel` y `vercel --prod`.

## Precios, combos y reportes
- Cada producto tiene **precio evento** (el que se cobra en la venta) y **precio factura** (el que usan las boletas de ejemplo).
- La categoría **Combos** junta 2 o más productos con un solo precio. Al vender el combo se descuenta el stock de cada producto.
- En **Reportes** el admin ve lo cobrado por medio de pago. Tarjeta es el POS. **GENERAR BOLETAS EJEMPLO** arma un PDF con la cantidad de boletas que indiques: productos del catálogo a precio factura, montos distintos, que suman el cobro elegido.

## Notas
- Roles: **admin** ve todo (stock, panel, reportes, usuarios y quién vendió más o menos); **ventas** solo vende y ve sus propias ventas del evento.
- Para cambiar una clave, crea el usuario otra vez con el mismo nombre (se actualiza).
- Las claves se guardan con hash (scrypt) y la sesión dura 12 horas.
