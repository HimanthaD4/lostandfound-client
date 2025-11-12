import React, { useState } from 'react';
import { apiRequest } from './App';

const Login = ({ onLogin, onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await apiRequest('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        onLogin({ 
          email: data.email,
          device_info: data.device_info 
        });
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to connect to server. Make sure backend is running on port 5000 and check your network connection.');
    }
  };

  return (
    <div className="auth-box">
      <h2 className="auth-title">Login</h2>
      {error && <div style={{color: 'red', marginBottom: '15px', textAlign: 'center'}}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <input
            type="email"
            className="form-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <input
            type="password"
            className="form-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn">Login</button>
      </form>
      <div className="auth-switch">
        Don't have an account?{' '}
        <span className="auth-link" onClick={onSwitchToRegister}>
          Register here
        </span>
      </div>
    </div>
  );
};

export default Login;