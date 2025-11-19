const getApiBaseUrl = () => {
  return 'https://device-tracker-server.onrender.com/api';
};

const config = {
  API_BASE_URL: getApiBaseUrl(),
  
  CAMPUS_SETTINGS: {
    AUTO_CREATE_CAMPUS: true,
    CAMPUS_WIDTH: 0.00018, 
    CAMPUS_HEIGHT: 0.00018, 
    SECTIONS: []
  },
  
  REAL_TIME_SETTINGS: {
    ENABLED: true,
    UPDATE_INTERVAL: 1000, // 1 second for mobile GPS
    DESKTOP_UPDATE_INTERVAL: 3000, // 3 seconds for desktop
    LOCATION_TIMEOUT: 5000, // 5 seconds timeout
    HIGH_ACCURACY: true
  }
};

console.log('API Base URL:', config.API_BASE_URL);
console.log('Campus Settings:', config.CAMPUS_SETTINGS);
console.log('Real-time Settings:', config.REAL_TIME_SETTINGS);
export default config;