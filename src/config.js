// Configuration for API endpoints and campus settings
const getApiBaseUrl = () => {
  return 'http://192.168.1.125:5000/api';
};

const config = {
  API_BASE_URL: getApiBaseUrl(),
  
  // Campus Configuration - 20m x 20m campus with 4 properly separated sections
  CAMPUS_SETTINGS: {
    AUTO_CREATE_CAMPUS: true,
    CAMPUS_WIDTH: 0.00018, // ~20 meters in degrees
    CAMPUS_HEIGHT: 0.00018, // ~20 meters in degrees
    SECTIONS: [
      // Section definitions are now handled in MapView.js
    ]
  }
};

console.log('API Base URL:', config.API_BASE_URL);
console.log('Campus Settings:', config.CAMPUS_SETTINGS);
export default config;