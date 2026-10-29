const SENSOR_MOUNT_HEIGHT_CM = 88.9;
const WARN_LEVEL_CM = 44.45;
const CRIT_LEVEL_CM = 83.82;

function levelStatus(s) {
  const distance = s.Distance_cm ?? SENSOR_MOUNT_HEIGHT_CM;
  const rain = s.Rain_Value ?? 4095;
  const level = Math.max(0, SENSOR_MOUNT_HEIGHT_CM - distance);
  let status = 'safe';
  if (level >= CRIT_LEVEL_CM || rain <= 1200) status = 'critical';
  else if (level >= WARN_LEVEL_CM || rain <= 2200) status = 'warning';
  return { status, level };
}

module.exports = { levelStatus };