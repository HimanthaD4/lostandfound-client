import React, { useState, useEffect, useRef } from 'react';
import MapView from './MapView';
import { apiRequest } from './App';
import config from './config';

const Dashboard = ({ user, onLogout }) => {
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);
  const [locationStatus, setLocationStatus] = useState('initializing');
  const [userLocation, setUserLocation] = useState(null);
  const locationWatcherRef = useRef(null);
  const locationIntervalRef = useRef(null);
  const [deviceCheckComplete, setDeviceCheckComplete] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [behaviorProgress, setBehaviorProgress] = useState(0);
  const [behaviorSummary, setBehaviorSummary] = useState(null);
  const [learningActive, setLearningActive] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [locationUpdates, setLocationUpdates] = useState(0);
  const deviceTrackersRef = useRef(new Map());
  const currentDeviceSessionRef = useRef(null); // CRITICAL: Track current device session

  useEffect(() => {
  initializeDeviceTracking();
  fetchDevices();
  fetchAlerts();
  startBehaviorMonitoring();

  // Use polling instead of WebSocket for real-time updates
  const devicesInterval = setInterval(() => {
    fetchDevices();
  }, 2000); // Poll every 2 seconds for device updates

  const alertsInterval = setInterval(() => {
    fetchAlerts();
  }, 5000); // Poll every 5 seconds for alerts

  const behaviorInterval = setInterval(() => {
    fetchBehaviorProgress();
  }, 10000); // Poll every 10 seconds for behavior progress

  return () => {
    stopAllLocationTracking();
    clearInterval(devicesInterval);
    clearInterval(alertsInterval);
    clearInterval(behaviorInterval);
  };
}, [user]);

  const startBehaviorMonitoring = () => {
    setLearningActive(true);
    console.log('🎯 Behavior learning monitoring started');
  };

  const fetchBehaviorProgress = async () => {
    try {
      const response = await apiRequest(`/behavior/progress/${user.email}`);
      const data = await response.json();
      
      setBehaviorProgress(data.learning_progress);
      setBehaviorSummary(data.behavior_summary);
      
      if (data.learning_progress >= 100 && learningActive) {
        setLearningActive(false);
        console.log('✅ Behavior learning complete!');
      }
    } catch (err) {
      console.error('Failed to fetch behavior progress:', err);
    }
  };

  const simulateLearningComplete = async () => {
    try {
      const response = await apiRequest(`/behavior/simulate_complete/${user.email}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setBehaviorProgress(100);
        setLearningActive(false);
        alert('🎉 Behavior learning simulated as complete for demo!');
      }
    } catch (err) {
      console.error('Failed to simulate learning complete:', err);
    }
  };

  const initializeDeviceTracking = async () => {
    const deviceId = await getCurrentDeviceId();
    setCurrentDeviceId(deviceId);
    
    // CRITICAL FIX: Store current device session
    currentDeviceSessionRef.current = {
      deviceId: deviceId,
      isMobile: isMobileDevice(),
      userAgent: navigator.userAgent
    };
    
    const deviceExists = await checkDeviceExists(deviceId);
    setDeviceCheckComplete(true);
    
    if (!deviceExists) {
      console.log('Device does not exist, waiting for setup...');
      setLocationStatus('waiting_for_setup');
    } else {
      console.log('Device exists, starting independent location tracking...');
      startIndependentLocationTracking(deviceId);
    }
  };

  const getCurrentDeviceId = async () => {
    if (user.device_info?.device_id) {
      return user.device_info.device_id;
    }
    
    const userAgent = navigator.userAgent;
    const isMobile = isMobileDevice();
    // CRITICAL FIX: Generate unique device ID for this session
    const deviceId = `device_${user.email}_${isMobile ? 'mobile' : 'laptop'}_${btoa(userAgent).slice(0, 10)}_${Date.now()}`;
    
    return deviceId;
  };

  const checkDeviceExists = async (deviceId) => {
    try {
      const response = await apiRequest(`/devices/${user.email}`);
      const userDevices = await response.json();
      const exists = userDevices.some(device => device.device_id === deviceId);
      console.log(`Device ${deviceId} exists: ${exists}`);
      return exists;
    } catch (err) {
      console.error('Failed to check device existence:', err);
      return false;
    }
  };

  const isMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  // CRITICAL FIX: Independent location tracking for each device
  const startIndependentLocationTracking = (deviceId) => {
    console.log('🚀 Starting INDEPENDENT location tracking for device:', deviceId);
    
    if (isMobileDevice()) {
      startMobileGPSTracking(deviceId);
    } else {
      startLaptopLocationTracking(deviceId);
    }
  };

  const startMobileGPSTracking = (deviceId) => {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported, falling back to desktop mode');
      startLaptopLocationTracking(deviceId);
      return;
    }

    console.log('📱 Starting INDEPENDENT mobile GPS tracking for:', deviceId);
    setLocationStatus('tracking_mobile_gps');

    const updateLocation = async (position, source) => {
      await processGPSLocation(deviceId, position, source);
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await updateLocation(position, 'mobile_initial_fix');
      },
      (error) => {
        console.error('Initial GPS fix failed:', error);
        startLaptopLocationTracking(deviceId);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        await updateLocation(position, 'mobile_continuous_gps');
      },
      (error) => {
        console.error('GPS watch error:', error);
        setTimeout(() => {
          if (locationStatus === 'tracking_mobile_gps') {
            startLaptopLocationTracking(deviceId);
          }
        }, 30000);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 1000,
        distanceFilter: 1
      }
    );

    locationWatcherRef.current = watchId;
    deviceTrackersRef.current.set(deviceId, { 
      type: 'gps', 
      id: watchId,
      deviceType: 'mobile'
    });
  };

  const startLaptopLocationTracking = (deviceId) => {
    console.log('💻 Starting INDEPENDENT laptop location tracking for:', deviceId);
    setLocationStatus('tracking_laptop');

    if (!navigator.geolocation) {
      console.warn('Geolocation not supported on this laptop');
      setLocationStatus('tracking_fallback');
      startFallbackLocationTracking(deviceId);
      return;
    }

    const updateLaptopLocation = async (position, source) => {
      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading || 0,
        speed: position.coords.speed || 0,
        city: 'Laptop Browser Location',
        country: 'Browser Geolocation',
        location_type: 'browser_geolocation',
        timestamp: new Date().toISOString(),
        source: source,
        is_mobile: false,
        gps_quality: getGPSQuality(position.coords.accuracy),
        device_id: deviceId // CRITICAL: Include device ID in location data
      };

      setGpsAccuracy(position.coords.accuracy);
      setLocationUpdates(prev => prev + 1);
      
      // Only update user location if this is the current device
      if (deviceId === currentDeviceId) {
        setUserLocation({
          latitude: location.latitude,
          longitude: location.longitude
        });
      }

      await updateDeviceLocation(deviceId, location);
    };

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        console.log('📍 Laptop initial location acquired:', position.coords);
        await updateLaptopLocation(position, 'laptop_initial');
      },
      async (error) => {
        console.error('Laptop geolocation failed:', error);
        setLocationStatus('tracking_fallback');
        await startFallbackLocationTracking(deviceId);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    // Set up continuous updates for laptop (less frequent than mobile)
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        await updateLaptopLocation(position, 'laptop_continuous');
      },
      (error) => {
        console.error('Laptop location watch error:', error);
        setLocationStatus('tracking_fallback');
        startFallbackLocationTracking(deviceId);
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 30000,
        distanceFilter: 10
      }
    );

    deviceTrackersRef.current.set(deviceId, { 
      type: 'gps', 
      id: watchId,
      deviceType: 'laptop'
    });
  };

  const startFallbackLocationTracking = async (deviceId) => {
    console.log('🔄 Using fallback location tracking for device:', deviceId);
    
    const updateLocation = async () => {
      try {
        const networkLocation = await getNetworkBasedLocation();
        networkLocation.device_id = deviceId; // CRITICAL: Include device ID
        await updateDeviceLocation(deviceId, networkLocation);
      } catch (error) {
        console.error('Fallback location update failed:', error);
      }
    };

    // Update immediately
    await updateLocation();

    // Set up periodic updates
    const intervalId = setInterval(async () => {
      await updateLocation();
    }, 30000);

    locationIntervalRef.current = intervalId;
    deviceTrackersRef.current.set(deviceId, { 
      type: 'interval', 
      id: intervalId,
      deviceType: 'fallback'
    });
  };

  const processGPSLocation = async (deviceId, position, source) => {
    const location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
      city: 'Live GPS Tracking',
      country: 'Real-time Location',
      location_type: 'gps_live_mobile',
      timestamp: new Date().toISOString(),
      source: source,
      is_mobile: true,
      gps_quality: getGPSQuality(position.coords.accuracy),
      device_id: deviceId // CRITICAL: Include device ID
    };

    setGpsAccuracy(position.coords.accuracy);
    setLocationUpdates(prev => prev + 1);
    
    // Only update user location if this is the current device
    if (deviceId === currentDeviceId) {
      setUserLocation({
        latitude: location.latitude,
        longitude: location.longitude
      });
    }

    await updateDeviceLocation(deviceId, location);
  };

  const getGPSQuality = (accuracy) => {
    if (accuracy < 10) return 'excellent';
    if (accuracy < 25) return 'good';
    if (accuracy < 50) return 'moderate';
    return 'poor';
  };

  const getNetworkBasedLocation = async () => {
    try {
      const services = [
        'https://ipapi.co/json/',
        'https://api.ipgeolocation.io/ipgeo?apiKey=demo',
        'https://extreme-ip-lookup.com/json/'
      ];

      for (const service of services) {
        try {
          const response = await fetch(service, { timeout: 5000 });
          if (response.ok) {
            const data = await response.json();
            
            if (data.latitude && data.longitude) {
              return {
                latitude: data.latitude,
                longitude: data.longitude,
                accuracy: 1000,
                city: data.city || 'Unknown',
                country: data.country_name || data.country || 'Unknown',
                location_type: 'network_ip',
                timestamp: new Date().toISOString(),
                source: 'network_geolocation',
                is_mobile: false
              };
            }
          }
        } catch (error) {
          console.log(`Service ${service} failed:`, error.message);
          continue;
        }
      }

      return {
        latitude: 6.9271 + (Math.random() - 0.5) * 0.001,
        longitude: 79.8612 + (Math.random() - 0.5) * 0.001,
        accuracy: 5000,
        city: 'Colombo',
        country: 'Sri Lanka',
        location_type: 'network_fallback',
        timestamp: new Date().toISOString(),
        source: 'fallback',
        is_mobile: false
      };
    } catch (error) {
      console.error('All network location services failed:', error);
      return {
        latitude: 6.9271,
        longitude: 79.8612,
        accuracy: 10000,
        city: 'Colombo',
        country: 'Sri Lanka',
        location_type: 'default',
        timestamp: new Date().toISOString(),
        source: 'default_fallback',
        is_mobile: false
      };
    }
  };

  const updateDeviceLocation = async (deviceId, location) => {
    try {
      console.log(`📍 Updating location for device ${deviceId}:`, {
        lat: location.latitude,
        lng: location.longitude,
        source: location.source
      });

      const response = await apiRequest('/update_device_location', {
        method: 'POST',
        body: JSON.stringify({
          email: user.email,
          device_id: deviceId,
          location: location
        }),
      });

      if (response.ok) {
        const result = await response.json();
        
        setDevices(prevDevices => {
          const updatedDevices = prevDevices.map(device => 
            device.device_id === deviceId 
              ? { 
                  ...device, 
                  last_location: location,
                  last_updated: new Date().toISOString(),
                  is_mobile: location.is_mobile || false
                }
              : device
          );
          
          const deviceExists = updatedDevices.some(device => device.device_id === deviceId);
          if (!deviceExists) {
            const newDevice = {
              device_id: deviceId,
              device_name: isMobileDevice() ? 'My Mobile Phone' : 'My Laptop',
              device_type: isMobileDevice() ? 'mobile' : 'laptop',
              last_location: location,
              last_updated: new Date().toISOString(),
              is_mobile: location.is_mobile || false
            };
            return [...updatedDevices, newDevice];
          }
          
          return updatedDevices;
        });

        if (result.anomalies_detected > 0) {
          console.log(`🚨 ${result.anomalies_detected} behavior anomalies detected for device ${deviceId}`);
        }
      } else {
        const errorData = await response.json();
        if (errorData.code === 'DEVICE_NOT_FOUND') {
          console.log('Device not found, waiting for setup...');
          setLocationStatus('waiting_for_setup');
        } else {
          console.error('Failed to update device location:', errorData);
        }
      }
    } catch (err) {
      console.error('Failed to update device location:', err);
    }
  };

  const stopAllLocationTracking = () => {
    if (locationWatcherRef.current) {
      navigator.geolocation.clearWatch(locationWatcherRef.current);
    }
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }
    
    deviceTrackersRef.current.forEach((tracker, deviceId) => {
      if (tracker.type === 'gps') {
        navigator.geolocation.clearWatch(tracker.id);
      } else if (tracker.type === 'interval') {
        clearInterval(tracker.id);
      }
    });
    
    deviceTrackersRef.current.clear();
    console.log('Stopped all location tracking');
  };

  const fetchDevices = async () => {
    try {
      const response = await apiRequest(`/devices/${user.email}`);
      const data = await response.json();
      
      const updatedDevices = data.map(device => {
        const existingDevice = devices.find(d => d.device_id === device.device_id);
        if (existingDevice && existingDevice.last_location && device.last_location) {
          return {
            ...device,
            last_location: {
              ...device.last_location,
              is_mobile: existingDevice.last_location.is_mobile
            }
          };
        }
        return device;
      });
      
      setDevices(updatedDevices);
      
      // CRITICAL FIX: Start tracking for any new devices that aren't being tracked
      updatedDevices.forEach(device => {
        if (!deviceTrackersRef.current.has(device.device_id) && device.device_id !== currentDeviceId) {
          console.log(`🆕 Starting independent tracking for additional device: ${device.device_id}`);
          startAdditionalDeviceTracking(device.device_id, device.is_mobile);
        }
      });
    } catch (err) {
      console.error('Failed to fetch devices:', err);
    }
  };

  const startAdditionalDeviceTracking = (deviceId, isMobile) => {
    if (isMobile) {
      startAdditionalMobileTracking(deviceId);
    } else {
      startAdditionalLaptopTracking(deviceId);
    }
  };

  const startAdditionalMobileTracking = (deviceId) => {
    if (!navigator.geolocation) return;

    console.log(`📱 Starting INDEPENDENT mobile tracking for additional device: ${deviceId}`);

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading || 0,
          speed: position.coords.speed || 0,
          city: 'Mobile Device GPS',
          country: 'Real-time Location',
          location_type: 'gps_mobile_device',
          timestamp: new Date().toISOString(),
          source: 'mobile_device_gps',
          is_mobile: true,
          gps_quality: getGPSQuality(position.coords.accuracy),
          device_id: deviceId // CRITICAL: Include device ID
        };
        await updateDeviceLocation(deviceId, location);
      },
      (error) => {
        console.error(`GPS tracking failed for device ${deviceId}:`, error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 2000,
        distanceFilter: 2
      }
    );

    deviceTrackersRef.current.set(deviceId, { 
      type: 'gps', 
      id: watchId,
      deviceType: 'mobile_additional'
    });
    console.log(`📍 Started INDEPENDENT GPS tracking for additional mobile device: ${deviceId}`);
  };

  const startAdditionalLaptopTracking = (deviceId) => {
    if (!navigator.geolocation) {
      startFallbackLocationTracking(deviceId);
      return;
    }

    console.log(`💻 Starting INDEPENDENT browser geolocation for additional laptop: ${deviceId}`);

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading || 0,
          speed: position.coords.speed || 0,
          city: 'Laptop Browser Location',
          country: 'Browser Geolocation',
          location_type: 'browser_geolocation',
          timestamp: new Date().toISOString(),
          source: 'laptop_additional',
          is_mobile: false,
          gps_quality: getGPSQuality(position.coords.accuracy),
          device_id: deviceId // CRITICAL: Include device ID
        };
        await updateDeviceLocation(deviceId, location);
      },
      (error) => {
        console.error(`Laptop geolocation failed for device ${deviceId}:`, error);
        startFallbackLocationTracking(deviceId);
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 30000,
        distanceFilter: 10
      }
    );

    deviceTrackersRef.current.set(deviceId, { 
      type: 'gps', 
      id: watchId,
      deviceType: 'laptop_additional'
    });
    console.log(`📍 Started INDEPENDENT browser geolocation tracking for additional laptop: ${deviceId}`);
  };

  const fetchAlerts = async () => {
    try {
      const response = await apiRequest(`/alerts/${user.email}`);
      const data = await response.json();
      setAlerts(data);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    }
  };

  const getStatus = (device) => {
    if (!device.last_updated) return 'offline';
    
    const lastUpdate = new Date(device.last_updated);
    const now = new Date();
    const diffSeconds = (now - lastUpdate) / 1000;
    
    if (diffSeconds > 30) return 'offline';
    if (diffSeconds > 15) return 'warning';
    return 'safe';
  };

  const forceHighAccuracyUpdate = async () => {
    if (!currentDeviceId) return;

    setLocationStatus('manual_high_accuracy');
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading || 0,
            speed: position.coords.speed || 0,
            city: 'Manual High Accuracy',
            country: 'GPS',
            location_type: 'gps_manual_high_accuracy',
            timestamp: new Date().toISOString(),
            source: 'manual_gps_high_accuracy',
            is_mobile: isMobileDevice(),
            gps_quality: getGPSQuality(position.coords.accuracy),
            device_id: currentDeviceId // CRITICAL: Include device ID
          };
          await updateDeviceLocation(currentDeviceId, location);
          setLocationStatus(isMobileDevice() ? 'tracking_mobile_gps' : 'tracking_laptop');
        },
        async (error) => {
          console.error('Manual high accuracy location failed:', error);
          const fallbackLocation = await getNetworkBasedLocation();
          fallbackLocation.device_id = currentDeviceId;
          await updateDeviceLocation(currentDeviceId, fallbackLocation);
          setLocationStatus(isMobileDevice() ? 'tracking_mobile_gps' : 'tracking_laptop');
        },
        { 
          enableHighAccuracy: true, 
          timeout: 15000,
          maximumAge: 0 
        }
      );
    } else {
      const fallbackLocation = await getNetworkBasedLocation();
      fallbackLocation.device_id = currentDeviceId;
      await updateDeviceLocation(currentDeviceId, fallbackLocation);
      setLocationStatus(isMobileDevice() ? 'tracking_mobile_gps' : 'tracking_laptop');
    }
  };

  const getLocationStatusText = () => {
    switch(locationStatus) {
      case 'tracking_mobile_gps': 
        return `📱 Live Mobile GPS (Accuracy: ±${gpsAccuracy ? Math.round(gpsAccuracy) : '?'}m)`;
      case 'tracking_laptop': 
        return '💻 Laptop Browser Location';
      case 'tracking_fallback': 
        return '🌐 Network-based Location';
      case 'waiting_for_setup': 
        return '⏳ Waiting for Device Setup...';
      case 'manual_high_accuracy': 
        return '🎯 Getting High Accuracy Location...';
      case 'initializing': 
        return '⚙️ Initializing Location...';
      default: 
        return '📍 Location Tracking';
    }
  };

  const getDisplayAlerts = () => {
    if (showAllAlerts) {
      return alerts;
    }
    return alerts.slice(-3);
  };

  const toggleShowAllAlerts = () => {
    setShowAllAlerts(!showAllAlerts);
  };

  const campusSections = [
    { name: "Library Section", type: "library", color: "#3B82F6" },
    { name: "Laboratory Section", type: "lab", color: "#10B981" },
    { name: "Classroom Section", type: "classroom", color: "#F59E0B" },
    { name: "Administration Section", type: "admin", color: "#EF4444" }
  ];

  const getLearningStatusText = () => {
    if (behaviorProgress >= 100) {
      return '✅ Behavior Learning Complete';
    } else if (behaviorProgress > 0) {
      return `🎯 Learning Behavior... ${Math.round(behaviorProgress)}%`;
    } else {
      return '⏳ Waiting to learn behavior patterns';
    }
  };

  const getSimulatedDays = () => {
    return Math.min(7, Math.floor(behaviorProgress / 100 * 7));
  };

  // CRITICAL FIX: Check if device is current device
  const isCurrentDevice = (device) => {
    return device.device_id === currentDeviceId;
  };

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="nav-title">
          📍 Smart Device Tracker - INDEPENDENT DEVICE TRACKING
          <span className="live-indicator">LIVE</span>
          <span className="location-status-badge">{getLocationStatusText()}</span>
          {locationUpdates > 0 && (
            <span className="update-counter">Updates: {locationUpdates}</span>
          )}
        </div>
        <div className="nav-user">
          Welcome, {user.email}
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </nav>

      {learningActive && (
        <div className="behavior-learning-section">
          <div className="learning-header">
            <h3>🎯 AI Behavior Learning</h3>
            <span className="learning-status">{getLearningStatusText()}</span>
          </div>
          
          <div className="progress-container">
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${behaviorProgress}%` }}
              ></div>
            </div>
            <div className="progress-info">
              <span>Simulated Days: {getSimulatedDays()}/7</span>
              <span>{Math.round(behaviorProgress)}% Complete</span>
            </div>
          </div>

          {behaviorSummary && behaviorProgress > 0 && (
            <div className="learning-stats">
              <div className="stat-item">
                <strong>Schedule Consistency:</strong> 
                <span>{(behaviorSummary.schedule_consistency * 100).toFixed(0)}%</span>
              </div>
              <div className="stat-item">
                <strong>Patterns Learned:</strong> 
                <span>{behaviorSummary.learned_patterns}</span>
              </div>
              <div className="stat-item">
                <strong>Devices Analyzed:</strong> 
                <span>{behaviorSummary.devices_analyzed}</span>
              </div>
            </div>
          )}

          {behaviorProgress < 100 && (
            <div className="learning-tip">
              <small>
                💡 <strong>Demo Tip:</strong> The system is learning your behavior patterns. 
                Move between campus sections to help it learn. 
                Or <button 
                  className="simulate-btn" 
                  onClick={simulateLearningComplete}
                >
                  Simulate Complete Learning
                </button>
              </small>
            </div>
          )}

          {behaviorProgress >= 100 && (
            <div className="learning-complete">
              <div className="celebration">🎉</div>
              <p><strong>Behavior Learning Complete!</strong> The system will now detect suspicious activities.</p>
            </div>
          )}
        </div>
      )}

      <div className="dashboard-content">
        <div className="devices-section">
          <div className="section-header">
            <h3>My Devices ({devices.length})</h3>
            <div className="location-controls">
              <button className="btn btn-small btn-high-accuracy" onClick={forceHighAccuracyUpdate}>
                🎯 High Accuracy Update
              </button>
            </div>
          </div>
          {devices.map((device, index) => (
            <div key={device.device_id} className="device-card">
              <div className="device-header">
                <h4>{device.device_name || `Device ${index + 1}`}</h4>
                <span className={`device-status status-${getStatus(device)}`}>
                  {getStatus(device).toUpperCase()}
                  {getStatus(device) === 'safe' ? ' 🟢' : 
                   getStatus(device) === 'warning' ? ' 🟡' : ' 🔴'}
                </span>
              </div>
              
              <div className="device-info">
                <p><strong>Type:</strong> {device.device_type} {device.is_mobile ? '📱' : '💻'}</p>
                <p><strong>Location Source:</strong> {device.last_location?.source || 'Unknown'}</p>
                <p><strong>GPS Quality:</strong> 
                  {device.last_location?.gps_quality ? 
                    <span className={`gps-quality ${device.last_location.gps_quality}`}>
                      {device.last_location.gps_quality.toUpperCase()}
                    </span> : 
                    'N/A'
                  }
                </p>
                <p><strong>Area:</strong> {device.last_location?.city || 'Unknown'}</p>
                <p><strong>Coordinates:</strong> 
                  {device.last_location ? 
                    `${device.last_location.latitude?.toFixed(6)}, ${device.last_location.longitude?.toFixed(6)}` : 
                    'No location data'
                  }
                </p>
                <p><strong>Accuracy:</strong> {device.last_location?.accuracy ? `±${Math.round(device.last_location.accuracy)}m` : 'Unknown'}</p>
                <p><strong>Last Update:</strong> {device.last_updated ? 
                  new Date(device.last_updated).toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo' }) : 'Never'}</p>
                
                {device.last_location?.heading && (
                  <p><strong>Heading:</strong> {device.last_location.heading.toFixed(1)}°</p>
                )}
                {device.last_location?.speed > 0 && (
                  <p><strong>Speed:</strong> {(device.last_location.speed * 3.6).toFixed(1)} km/h</p>
                )}
              </div>
              
              {isCurrentDevice(device) && (
                <div className="current-device-badge">
                  ✅ Current Device - {device.is_mobile ? 'Mobile GPS' : 'Laptop Browser'} Tracking Active
                </div>
              )}
              
              {!isCurrentDevice(device) && (
                <div className="additional-device-badge">
                  📍 Additional Device - Independent Tracking Active
                </div>
              )}
            </div>
          ))}
          {devices.length === 0 && (
            <div className="no-devices">
              <p>No devices found. Complete device setup to start tracking.</p>
            </div>
          )}
        </div>

        <div className="alerts-section">
          <div className="section-header">
            <h3>Alerts ({alerts.length})</h3>
            {alerts.length > 3 && (
              <button 
                className="btn btn-small" 
                onClick={toggleShowAllAlerts}
                style={{ 
                  background: 'transparent', 
                  border: '1px solid #667eea',
                  color: '#667eea'
                }}
              >
                {showAllAlerts ? '▲ Show Less' : '▼ Show All'}
              </button>
            )}
          </div>
          
          <div className={`alerts-container ${showAllAlerts ? 'show-all' : 'show-limited'}`}>
            {getDisplayAlerts().map((alert, index) => (
              <div key={index} className={`alert-card ${alert.type === 'suspicious_behavior' ? 'behavior-alert' : ''}`}>
                <div className="alert-header">
                  <strong>{alert.type.replace('_', ' ').toUpperCase()}</strong>
                  <span className="alert-time">
                    {new Date(alert.created_at).toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo' })}
                  </span>
                </div>
                <p>{alert.message}</p>
                {alert.severity === 'high' && (
                  <div className="alert-severity high">🚨 HIGH SEVERITY</div>
                )}
              </div>
            ))}
          </div>
          
          {alerts.length === 0 && (
            <div className="no-alerts">
              <p>No alerts - Everything looks good! ✅</p>
            </div>
          )}
          
          {!showAllAlerts && alerts.length > 3 && (
            <div className="alerts-footer">
              <p className="alerts-more-indicator">
                ... and {alerts.length - 3} more alerts. 
                <span 
                  className="view-all-link" 
                  onClick={toggleShowAllAlerts}
                  style={{ cursor: 'pointer', color: '#667eea', marginLeft: '5px' }}
                >
                  View all
                </span>
              </p>
            </div>
          )}
        </div>

        <div className="map-section">
          <h3>Live Device Locations - INDEPENDENT TRACKING</h3>
          <div className="map-container">
            <MapView devices={devices} userLocation={userLocation} />
          </div>
          
          <div className="campus-legend">
            <h4>Campus Sections</h4>
            {campusSections.map((section, index) => (
              <div key={index} className="legend-zone-item">
                <span 
                  className="legend-zone-color" 
                  style={{backgroundColor: section.color}}
                ></span>
                <span>{section.name} ({section.type})</span>
              </div>
            ))}
          </div>
          
          <div className="tracking-info">
            <p><strong>Independent Device Tracking:</strong> Each device maintains its own location data</p>
            <p><strong>Active Trackers:</strong> {deviceTrackersRef.current.size} devices being tracked independently</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;