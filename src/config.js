const getApiBaseUrl = () => {
  // Method 1: Environment variable (highest priority)
  if (process.env.REACT_APP_API_BASE_URL) {
    return process.env.REACT_APP_API_BASE_URL;
  }
  
  // Method 2: NODE_ENV based (automatic)
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5000/api';
  }
  
  // Method 3: REACT_APP_ENV variable
  if (process.env.REACT_APP_ENV === 'local') {
    return 'http://localhost:5000/api';
  }
  
  // Default: Production URL
  return 'https://lostandfound-backend-zl1h.onrender.com/api';
};

const config = {
  API_BASE_URL: getApiBaseUrl(),
  
  CAMPUS_SETTINGS: {
    AUTO_CREATE_CAMPUS: true,
    CAMPUS_WIDTH: 0.00018, 
    CAMPUS_HEIGHT: 0.00018, 
    SECTIONS: []
  }
};

console.log('===== Environment Configuration =====');
console.log('Environment:', process.env.NODE_ENV);
console.log('REACT_APP_ENV:', process.env.REACT_APP_ENV);
console.log('REACT_APP_API_BASE_URL:', process.env.REACT_APP_API_BASE_URL);
console.log('API Base URL:', config.API_BASE_URL);
console.log('=====================================');

export default config;