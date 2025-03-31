// auth.js - Handle user authentication in the frontend
document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');
    
    const loginButton = document.getElementById('login-button');
    const registerButton = document.getElementById('register-button');
    
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');
    
    // Toggle between login and registration forms
    showRegisterLink?.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    });
    
    showLoginLink?.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
    });
    
    // Handle login
    loginButton?.addEventListener('click', async () => {
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        
        if (!username || !password) {
            loginError.textContent = 'Please enter both username and password';
            return;
        }
        
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                loginError.textContent = data.error || 'Login failed';
                return;
            }
            
            // Store auth token and user info
            localStorage.setItem('tetris_token', data.token);
            localStorage.setItem('tetris_user_id', data.userId);
            localStorage.setItem('tetris_username', data.username);
            
            // Redirect to game
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Login error:', error);
            loginError.textContent = 'An error occurred during login';
        }
    });
    
    // Handle registration
    registerButton?.addEventListener('click', async () => {
        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;
        
        // Validation
        if (!username || !email || !password || !confirm) {
            registerError.textContent = 'Please fill in all fields';
            return;
        }
        
        if (password !== confirm) {
            registerError.textContent = 'Passwords do not match';
            return;
        }
        
        if (password.length < 6) {
            registerError.textContent = 'Password must be at least 6 characters long';
            return;
        }
        
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, email, password })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                registerError.textContent = data.error || 'Registration failed';
                return;
            }
            
            // Show success message and switch to login
            registerError.textContent = '';
            alert('Registration successful! You can now log in.');
            registerForm.style.display = 'none';
            loginForm.style.display = 'block';
        } catch (error) {
            console.error('Registration error:', error);
            registerError.textContent = 'An error occurred during registration';
        }
    });
    
    // Check if user is already logged in
    const checkAuthStatus = () => {
        const token = localStorage.getItem('tetris_token');
        if (token && window.location.pathname.includes('login.html')) {
            // If we're on the login page but already logged in, redirect to game
            window.location.href = 'index.html';
        }
    };
    
    // Check auth status on page load
    checkAuthStatus();
});
