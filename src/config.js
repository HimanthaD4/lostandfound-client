// config.js - FIXED VERSION
const config = {
  // Always use the Render backend URL - remove localhost completely
  API_BASE_URL: 'https://device-tracker-server.onrender.com/api',
  
  // Campus Configuration
  CAMPUS_SETTINGS: {
    AUTO_CREATE_CAMPUS: true,
    CAMPUS_WIDTH: 0.00018,
    CAMPUS_HEIGHT: 0.00018,
    SECTIONS: []
  }
};

console.log('API Base URL:', config.API_BASE_URL);
console.log('Environment:', process.env.NODE_ENV);
export default config;