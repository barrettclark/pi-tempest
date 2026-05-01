export const ICONS = {
  'clear-day':          '☀️',
  'clear-night':        '🌙',
  'cloudy':             '☁️',
  'partly-cloudy-day':  '⛅',
  'partly-cloudy-night':'🌙',
  'rain':               '🌧️',
  'snow':               '❄️',
  'sleet':              '🌨️',
  'wind':               '💨',
  'fog':                '🌫️',
  'thunderstorm':       '⛈️',
  'tornado':            '🌪️',
};

export function iconEmoji(iconStr) {
  return ICONS[iconStr] || '🌡️';
}
