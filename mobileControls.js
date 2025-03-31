// mobileControls.js - Handles mobile touch controls for the game

export class MobileControlsHandler {
  constructor(gameActions) {
    this.gameActions = gameActions;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchThreshold = 30; // Minimum swipe distance to trigger an action
    this.isTap = false; // Flag to track if the touch is a tap
    this.touchStartTime = 0; // To track tap duration
    this.maxTapDuration = 200; // Maximum time (ms) for a touch to be considered a tap
    this.controlsContainer = null;
    this.isMobileDevice = this.detectMobileDevice();
    
    // Continuous movement tracking
    this.moveIntervalId = null;
    this.moveDirection = null;
    this.moveSpeed = 150; // ms between moves when holding
    this.isMoving = false;
    
    // Initialize mobile controls
    this.initMobileControls();
    
    console.log("Mobile Controls initialized, isMobileDevice:", this.isMobileDevice);
  }

  // Detect if the device has touch capabilities
  detectMobileDevice() {
    // Use more reliable detection that also works with emulators
    const isMobile = 
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      ('ontouchstart' in window) || 
      (navigator.maxTouchPoints > 0) || 
      (navigator.msMaxTouchPoints > 0) ||
      window.matchMedia("(max-width: 767px)").matches; // Check screen size as well
    
    console.log("Mobile detection:", isMobile, "UserAgent:", navigator.userAgent);
    return isMobile;
  }

  // Initialize mobile controls
  initMobileControls() {
    // Add touch event listeners to the game canvas
    const gameCanvas = document.getElementById('gameCanvas');
    if (gameCanvas) {
      // Remove any existing event listeners (to avoid duplicates)
      gameCanvas.removeEventListener('touchstart', this.handleTouchStart);
      gameCanvas.removeEventListener('touchmove', this.handleTouchMove);
      gameCanvas.removeEventListener('touchend', this.handleTouchEnd);
      
      // Add touch event listeners with bound context
      gameCanvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
      gameCanvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
      gameCanvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
    }
    
    // Get the mobile controls container (now only has Hold button)
    this.controlsContainer = document.getElementById('mobileControls');
    if (this.controlsContainer) {
      // Setup the hold button listener
      const holdBtn = document.getElementById('holdBtn');
      if (holdBtn) {
        this.setupButtonEvents(holdBtn, () => this.gameActions.hold());
      }
    }
  }
  
  // Setup both touch and mouse events for a button
  setupButtonEvents(button, callback) {
    // Remove any existing event listeners (to avoid duplicates)
    button.removeEventListener('touchstart', this._touchStartHandler);
    button.removeEventListener('touchend', this._touchEndHandler);
    button.removeEventListener('mousedown', this._mouseDownHandler);
    button.removeEventListener('mouseup', this._mouseUpHandler);
    
    // Define event handlers
    this._touchStartHandler = (e) => {
      e.preventDefault();
      callback();
      button.classList.add('active');
    };
    
    this._touchEndHandler = (e) => {
      e.preventDefault();
      button.classList.remove('active');
    };
    
    this._mouseDownHandler = () => {
      callback();
      button.classList.add('active');
    };
    
    this._mouseUpHandler = () => {
      button.classList.remove('active');
    };
    
    // Add new event listeners
    button.addEventListener('touchstart', this._touchStartHandler);
    button.addEventListener('touchend', this._touchEndHandler);
    button.addEventListener('mousedown', this._mouseDownHandler);
    button.addEventListener('mouseup', this._mouseUpHandler);
  }

  // Handle touch start
  handleTouchStart(e) {
    // Stop any existing movement
    this.stopContinuousMovement();
    
    // Store the starting coordinates for swipe detection
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
    this.touchStartTime = Date.now();
    this.isTap = true; // Initially assume this might be a tap
  }

  // Handle touch move for swipe detection
  handleTouchMove(e) {
    if (!this.touchStartX || !this.touchStartY) {
      return;
    }
    
    // Get current touch position
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    
    // Calculate distance moved
    const diffX = touchX - this.touchStartX;
    const diffY = touchY - this.touchStartY;
    
    // If moved beyond threshold, it's not a tap
    if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
      this.isTap = false;
    }
    
    // Check for horizontal swipe with significant movement
    if (Math.abs(diffX) > this.touchThreshold && Math.abs(diffX) > Math.abs(diffY)) {
      // Determine direction
      const direction = diffX > 0 ? 'right' : 'left';
      
      // Start continuous movement if not already moving in this direction
      if (!this.isMoving || this.moveDirection !== direction) {
        this.startContinuousMovement(direction);
      }
    }
    
    // Prevent screen scrolling while swiping on the game canvas
    e.preventDefault();
  }

  // Start continuous movement in the specified direction
  startContinuousMovement(direction) {
    // Stop any existing movement first
    this.stopContinuousMovement();
    
    this.isMoving = true;
    this.moveDirection = direction;
    
    // Execute the movement immediately
    this.executeMoveInDirection(direction);
    
    // Set up interval for continuous movement
    this.moveIntervalId = setInterval(() => {
      this.executeMoveInDirection(direction);
    }, this.moveSpeed);
    
    console.log(`Started continuous ${direction} movement`);
  }
  
  // Execute movement in the specific direction
  executeMoveInDirection(direction) {
    if (direction === 'left') {
      this.gameActions.moveLeft();
    } else if (direction === 'right') {
      this.gameActions.moveRight();
    }
  }
  
  // Stop continuous movement
  stopContinuousMovement() {
    if (this.moveIntervalId) {
      clearInterval(this.moveIntervalId);
      this.moveIntervalId = null;
      console.log('Stopped continuous movement');
    }
    this.isMoving = false;
    this.moveDirection = null;
  }

  // Handle touch end for swipe detection and tap
  handleTouchEnd(e) {
    // Stop any continuous movement
    this.stopContinuousMovement();
    
    if (!this.touchStartX || !this.touchStartY) {
      return;
    }
    
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const touchEndTime = Date.now();
    
    // Calculate distance and duration
    const diffX = touchEndX - this.touchStartX;
    const diffY = touchEndY - this.touchStartY;
    const duration = touchEndTime - this.touchStartTime;
    
    // Check if it's a tap (short touch without much movement)
    if (this.isTap && duration < this.maxTapDuration) {
      // It's a tap - rotate the piece
      this.gameActions.rotate();
      console.log("Tap detected - rotating piece");
    } else {
      // It's a swipe - determine direction for vertical swipes only
      // Horizontal swipes are handled by the continuous movement system
      if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > this.touchThreshold) {
        this.handleVerticalSwipe(diffY);
      }
    }
    
    // Reset touch tracking
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.isTap = false;
  }
  
  // Handle vertical swipe
  handleVerticalSwipe(diffY) {
    if (diffY > 0) {
      // Swipe down - soft drop with more moderate effect
      const swipeStrength = Math.floor(Math.abs(diffY) / 80);
      const repeats = Math.min(Math.max(swipeStrength, 1), 2);
      
      console.log(`Swipe down detected - soft drop (strength: ${repeats})`);
      
      // Apply soft drop with a moderated effect
      this.gameActions.softDrop(); // Always call at least once
      
      // Add an extra call only for strong swipes
      if (repeats > 1) {
        // Small delay to make the effect feel more natural
        setTimeout(() => {
          this.gameActions.softDrop();
        }, 50);
      }
    } else {
      // Swipe up - hard drop
      this.gameActions.hardDrop();
      console.log("Swipe up detected - hard drop");
    }
  }

  // Show mobile controls
  show() {
    if (this.controlsContainer) {
      this.controlsContainer.style.display = 'flex';
    }
    
    // Also show mobile instructions if they exist
    const instructions = document.getElementById('mobileInstructions');
    if (instructions) {
      instructions.style.display = 'block';
    }
  }

  // Hide mobile controls
  hide() {
    if (this.controlsContainer) {
      this.controlsContainer.style.display = 'none';
    }
    
    // Also hide mobile instructions if they exist
    const instructions = document.getElementById('mobileInstructions');
    if (instructions) {
      instructions.style.display = 'none';
    }
  }
}
