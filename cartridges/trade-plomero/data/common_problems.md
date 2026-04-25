# Heurísticas síntoma → causa

NO se usan como ground-truth — el plomero verifica en sitio. Sirven como
contexto para el agente vision-diagnoser para que su diagnóstico inicial
no diverja de patrones conocidos.

## Mancha en techo

- Crece rápido + cae agua → cañería de presión rota (severidad 5).
- Crece lento + halo amarillento + se correlaciona con uso de artefacto
  arriba → cañería de descarga (severidad 3).
- Solo después de lluvia → impermeabilización de azotea / filtración por
  techo, NO problema de plomería interno.

## Mancha en piso

- Junta de inodoro: agua aparece alrededor de la base del inodoro,
  intermitente, con uso del inodoro.
- Junta de ducha: agua aparece debajo de la ducha, persistente con uso.
- Cañería bajo piso: charco persistente sin uso de artefactos próximos —
  rotura subterránea.

## Desagüe lento

- Solo en un artefacto → obstrucción local (sifón, tubo de descarga
  inmediato).
- En varios artefactos → obstrucción del troncal vertical o cañería principal.
- Con olor → obstrucción + falta de ventilación, agregar columna de
  ventilación o destapar.

## Presión baja

- En todo el inmueble → bomba presurizadora caída, presión municipal baja,
  o filtración mayor antes de llegar al inmueble.
- Solo en piso superior → bomba caída (si hay) o tanque vacío / falla de
  carga del tanque.
- Solo en un artefacto → obstrucción del filtro / aireador del artefacto.

## Inodoro

- Pierde por la base con cada descarga → junta de cera/wc.
- Pierde por la conexión flex → flexible o llave de paso.
- Llena solo / no carga → flotador / válvula de entrada.
- Vuelve a llenar solo → válvula de salida (junta del herraje de descarga).

## Reglas de seguridad

- Cualquier intervención en cañería de presión: cerrar llave general antes.
- Sospecha de contaminación de agua potable (cañería con sucio interno
  visible): documentar y derivar antes de seguir.
- Humedad pegada a tablero / cableado: diagnóstico cruzado con electricista.
