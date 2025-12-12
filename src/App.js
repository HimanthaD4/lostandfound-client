import React, { useState, useEffect } from 'react';
import Login from './Login';
import Register from './Register';
import Dashboard from './Dashboard';
import DeviceSetupModal from './DeviceSetupModal';
import config from './config';
import './styles.css';

const apiRequest = async (endpoint, options = {}) => {
  const url = `${config.API_BASE_URL}${endpoint}`;
  
  console.log(`Making API request to: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (parseError) {
        errorData = { error: `HTTP error! status: ${response.status}` };
      }
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    return response;
  } catch (error) {
    console.error('API request failed:', error);
    console.error('Request URL:', url);
    
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      const isLocalhost = config.API_BASE_URL.includes('localhost');
      
      if (isLocalhost) {
        throw new Error(`Cannot connect to local backend server at ${config.API_BASE_URL}. Please ensure:
1. Backend server is running locally on port 5000
2. Run command in backend folder: python app.py
3. Check that the Flask server is running properly
4. Your network connection is stable`);
      } else {
        throw new Error(`Cannot connect to server at ${config.API_BASE_URL}. Please ensure:
1. Backend server is deployed and running
2. Your network connection is stable
3. No firewall is blocking the connection`);
      }
    }
    
    throw error;
  }
};

const testBackendConnection = async () => {
  try {
    const response = await fetch(`${config.API_BASE_URL}/health`);
    if (response.ok) {
      console.log('✅ Backend connection successful');
      return true;
    }
  } catch (error) {
    console.error('❌ Backend connection failed:', error);
    return false;
  }
};

function App() {
  const [user, setUser] = useState(null);
  const [isLogin, setIsLogin] = useState(true);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [connectionError, setConnectionError] = useState('');
  const [backendStatus, setBackendStatus] = useState('checking');

  useEffect(() => {
    testBackendConnection().then(success => {
      setBackendStatus(success ? 'connected' : 'disconnected');
    });

    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('user');
      }
    }
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    setConnectionError('');
    localStorage.setItem('user', JSON.stringify(userData));
    
    if (userData.device_info && userData.device_info.needs_setup) {
      setDeviceInfo(userData.device_info);
      setShowDeviceModal(true);
    }
  };

  const handleRegister = (userData) => {
    setUser(userData);
    setConnectionError('');
    localStorage.setItem('user', JSON.stringify(userData));
    
    const userAgent = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const deviceType = isMobile ? 'mobile' : 'laptop/desktop';
    const deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const registrationDeviceInfo = {
      needs_setup: true,
      device_id: deviceId,
      ip_address: 'auto-detected',
      device_type: deviceType,
      user_agent: userAgent,
      is_mobile: isMobile
    };
    
    setDeviceInfo(registrationDeviceInfo);
    setShowDeviceModal(true);
  };

  const handleLogout = () => {
    setUser(null);
    setConnectionError('');
    localStorage.removeItem('user');
    setShowDeviceModal(false);
    setDeviceInfo(null);
  };

  const handleDeviceSetup = async (deviceData) => {
    try {
      console.log('Attempting to add device:', deviceData.device_id);
      
      const response = await apiRequest('/create_or_update_device', {
        method: 'POST',
        body: JSON.stringify({
          email: user.email,
          device_data: deviceData,
          location_data: deviceData.location
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`Device ${result.action} successfully:`, result.device_id);
        
        setShowDeviceModal(false);
        setDeviceInfo(null);
        
        const updatedUser = { ...user };
        if (updatedUser.device_info) {
          updatedUser.device_info.needs_setup = false;
        }
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
        
      } else {
        const errorData = await response.json();
        console.error('Failed to add device:', errorData);
        
        if (errorData.error && errorData.error.includes('already exists')) {
          console.log('Device already exists, proceeding to dashboard');
          setShowDeviceModal(false);
          setDeviceInfo(null);
          
          const updatedUser = { ...user };
          if (updatedUser.device_info) {
            updatedUser.device_info.needs_setup = false;
          }
          setUser(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
        } else {
          setConnectionError(errorData.error || 'Failed to add device');
          alert('Failed to add device. Please try again.');
        }
      }
    } catch (err) {
      console.error('Error in device setup:', err);
      
      if (err.message && err.message.includes('already exists')) {
        console.log('Device already exists, proceeding to dashboard');
        setShowDeviceModal(false);
        setDeviceInfo(null);
        
        const updatedUser = { ...user };
        if (updatedUser.device_info) {
          updatedUser.device_info.needs_setup = false;
        }
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
      } else {
        setConnectionError(err.message);
        alert('Error setting up device. Please check your connection.');
      }
    }
  };

  const handleSkipDeviceSetup = () => {
    setShowDeviceModal(false);
    setDeviceInfo(null);
  };

  const switchToRegister = () => {
    setIsLogin(false);
    setConnectionError('');
  };

  const switchToLogin = () => {
    setIsLogin(true);
    setConnectionError('');
  };

  const retryConnection = async () => {
    setBackendStatus('checking');
    setConnectionError('');
    const success = await testBackendConnection();
    setBackendStatus(success ? 'connected' : 'disconnected');
    if (success) {
      setConnectionError('');
    }
  };

  return (
    <div className="App">
      {backendStatus === 'disconnected' && (
        <div className="connection-error">
          <div className="connection-error-content">
            <span className="connection-icon">⚠️</span>
            <span>Backend Server Disconnected</span>
            <button onClick={retryConnection} className="retry-btn">
              Retry Connection
            </button>
          </div>
        </div>
      )}
      
      {backendStatus === 'checking' && (
        <div className="connection-checking">
          <span className="connection-icon">🔄</span>
          Checking backend connection...
        </div>
      )}

      {connectionError && (
        <div className="connection-error">
          <div className="connection-error-content">
            <span className="connection-icon">⚠️</span>
            <span>{connectionError}</span>
            <button onClick={retryConnection} className="retry-btn">
              Retry
            </button>
          </div>
        </div>
      )}

      {!user ? (
        isLogin ? (
          <Login onLogin={handleLogin} onSwitchToRegister={switchToRegister} />
        ) : (
          <Register onRegister={handleRegister} onSwitchToLogin={switchToLogin} />
        )
      ) : (
        <>
          <Dashboard user={user} onLogout={handleLogout} />
          {showDeviceModal && deviceInfo && (
            <DeviceSetupModal
              deviceInfo={deviceInfo}
              userEmail={user.email}
              onConfirm={handleDeviceSetup}
              onSkip={handleSkipDeviceSetup}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
export { apiRequest };