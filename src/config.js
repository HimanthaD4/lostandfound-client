// Configuration for API endpoints and campus settings
const getApiBaseUrl = () => {
  // Use environment variable in production, localhost in development
  if (process.env.NODE_ENV === 'production') {
    return 'https://device-tracker-server.onrender.com/api';
  } else {
    return 'http://localhost:5000/api';
  }
};

const config = {
  API_BASE_URL: getApiBaseUrl(),
  
  // Campus Configuration
  CAMPUS_SETTINGS: {
    AUTO_CREATE_CAMPUS: true,
    CAMPUS_WIDTH: 0.00018,
    CAMPUS_HEIGHT: 0.00018,
    SECTIONS: []
  }
};

console.log('Environment:', process.env.NODE_ENV);
console.log('API Base URL:', config.API_BASE_URL);
export default config;