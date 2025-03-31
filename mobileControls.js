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
    this.swipeControlArea = null;
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
    // Add touch event listeners to the game canvas for rotate actions
    const gameCanvas = document.getElementById('gameCanvas');
    if (gameCanvas) {
      // Remove any existing event listeners (to avoid duplicates)
      gameCanvas.removeEventListener('touchstart', this._gameCanvasTouchStart);
      gameCanvas.removeEventListener('touchend', this._gameCanvasTouchEnd);
      
      // Create bound handlers
      this._gameCanvasTouchStart = this.handleTouchStart.bind(this, true);
      this._gameCanvasTouchEnd = this.handleTouchEnd.bind(this, true);
      
      // Add touch event listeners with bound context
      gameCanvas.addEventListener('touchstart', this._gameCanvasTouchStart);
      gameCanvas.addEventListener('touchend', this._gameCanvasTouchEnd);
    }
    
    // Get the swipe control area for movement controls
    this.swipeControlArea = document.getElementById('swipeControlArea');
    if (this.swipeControlArea) {
      // Remove any existing event listeners
      this.swipeControlArea.removeEventListener('touchstart', this._swipeAreaTouchStart);
      this.swipeControlArea.removeEventListener('touchmove', this._swipeAreaTouchMove);
      this.swipeControlArea.removeEventListener('touchend', this._swipeAreaTouchEnd);
      
      // Create bound handlers
      this._swipeAreaTouchStart = this.handleTouchStart.bind(this, false);
      this._swipeAreaTouchMove = this.handleTouchMove.bind(this, false);
      this._swipeAreaTouchEnd = this.handleTouchEnd.bind(this, false);
      
      // Add listeners
      this.swipeControlArea.addEventListener('touchstart', this._swipeAreaTouchStart);
      this.swipeControlArea.addEventListener('touchmove', this._swipeAreaTouchMove);
      this.swipeControlArea.addEventListener('touchend', this._swipeAreaTouchEnd);
    }
    
    // Get the mobile controls container (hold button)
    this.controlsContainer = document.getElementById('mobileControls');
    if (this.controlsContainer) {
      // Setup the hold button listener
      const holdBtn = document.getElementById('holdBtn');
      if (holdBtn) {
        this.setupButtonEvents(holdBtn, () => this.gameActions.hold());
      }
    }
    
    // Add document-wide touch handlers for everywhere except the game canvas
    document.addEventListener('touchmove', (e) => {
      if (e.target !== gameCanvas && 
          !gameCanvas.contains(e.target) && 
          this.isMoving) {
        this.handleTouchMove(false, e);
      }
    });
    
    document.addEventListener('touchend', (e) => {
      if (this.isMoving) {
        this.stopContinuousMovement();
      }
    });
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
  handleTouchStart(isGameCanvas, e) {
    // Stop any existing movement
    this.stopContinuousMovement();
    
    // Store the starting coordinates for swipe detection
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
    this.touchStartTime = Date.now();
    this.isTap = isGameCanvas; // Only track taps on the game canvas
    
    // Prevent default behavior
    e.preventDefault();
  }

  // Handle touch move for swipe detection
  handleTouchMove(isGameCanvas, e) {
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
    if (isGameCanvas && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
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
    } else if (!isGameCanvas && Math.abs(diffY) > this.touchThreshold && Math.abs(diffY) > Math.abs(diffX)) {
      // Vertical swipe on swipe area (not game canvas)
      if (diffY < 0) {
        // Swipe up - hard drop
        this.gameActions.hardDrop();
        console.log("Swipe up detected in control area - hard drop");
        
        // Reset touch tracking to prevent repeated actions
        this.touchStartX = touchX;
        this.touchStartY = touchY;
      }
    }
    
    // Prevent screen scrolling while swiping
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
  handleTouchEnd(isGameCanvas, e) {
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
    
    // Check if it's a tap on the game canvas (for rotation)
    if (isGameCanvas && this.isTap && duration < this.maxTapDuration) {
      // It's a tap - rotate the piece
      this.gameActions.rotate();
      console.log("Tap detected on game canvas - rotating piece");
    } else if (!isGameCanvas) {
      // Handle swipes in the control area
      if (Math.abs(diffY) > this.touchThreshold && Math.abs(diffY) > Math.abs(diffX)) {
        // Vertical swipe in control area
        if (diffY > 0) {
          // Swipe down - soft drop
          this.handleSoftDrop(diffY);
        } else {
          // Swipe up - already handled in move to prevent repeats
        }
      }
    } else if (isGameCanvas) {
      // Handle vertical swipes on game canvas
      if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > this.touchThreshold) {
        this.handleVerticalSwipe(diffY);
      }
    }
    
    // Reset touch tracking
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.isTap = false;
    
    // Prevent default
    e.preventDefault();
  }
  
  // Handle soft drop
  handleSoftDrop(diffY) {
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
  }
  
  // Handle vertical swipe
  handleVerticalSwipe(diffY) {
    if (diffY > 0) {
      this.handleSoftDrop(diffY);
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
    
    if (this.swipeControlArea) {
      this.swipeControlArea.style.display = 'block';
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
    
    if (this.swipeControlArea) {
      this.swipeControlArea.style.display = 'none';
    }
    
    // Also hide mobile instructions if they exist
    const instructions = document.getElementById('mobileInstructions');
    if (instructions) {
      instructions.style.display = 'none';
    }
  }
}
