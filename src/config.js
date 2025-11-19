const getApiBaseUrl = () => {
  return 'https://device-tracker-server.onrender.com/api';
};

const config = {
  API_BASE_URL: getApiBaseUrl(),
  
  CAMPUS_SETTINGS: {
    AUTO_CREATE_CAMPUS: true,
    CAMPUS_WIDTH: 0.00018, 
    CAMPUS_HEIGHT: 0.00018, 
    SECTIONS: [
    
    ]
  }
};

console.log('API Base URL:', config.API_BASE_URL);
console.log('Campus Settings:', config.CAMPUS_SETTINGS);
export default config;