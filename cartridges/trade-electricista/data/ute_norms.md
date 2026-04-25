# UTE / IEC 60364 — referencias relevantes para residencial Uruguay

Notas no normativas — para uso interno del electricista. La aplicación
NO sustituye la consulta del Reglamento de Baja Tensión de UTE vigente.

## Principios usados por los validadores

### Wet rooms (cocina / baño / lavadero / WC)

- Todo circuito que sirva un local con baño o ducha **debe** llevar
  protección diferencial RCD 30 mA. (IEC 60364-7-701; UTE RBT.)
- En Uruguay, la cocina se trata pragmáticamente como ambiente húmedo a
  efectos de RCD por presencia de electrodomésticos próximos a piletas.

### Sección de cable por breaker

| Breaker | Sección mínima cobre |
|---------|----------------------|
| 6 A     | 1.0 mm²              |
| 10 A    | 1.5 mm²              |
| 16 A    | 2.5 mm²              |
| 20 A    | 4 mm²                |
| 25 A    | 6 mm²                |
| 32 A    | 6 mm²                |
| 40 A    | 10 mm²               |
| 50 A    | 16 mm²               |
| 63 A    | 16 mm²               |

### Margen del breaker

- Capacidad del breaker ≥ 1.25 × corriente continua calculada.
- Corriente = potencia / tensión. (Para 230 V monofásico.)

### Circuitos dedicados

- Cargas > 2 kW: circuito dedicado (un solo punto de uso).
- Horno eléctrico, termocalefón, aire acondicionado, lavarropas, secarropas:
  típicamente dedicados.

## Decisiones del cartridge (que el validador checa)

- `power_off_documented`: cualquier paso del work_plan que toque un circuito
  energizado debe declarar esto. El reporte lo muestra al cliente como
  evidencia de protocolo.
- `rcd_post_repair`: trabajos en wet rooms deben dejar RCD 30 mA al cierre.
- `requires_matriculated_professional`: tablero principal / acometida ⇒ true.
