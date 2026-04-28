/**
 * ============================================================================
 * LB SERVICE - MODAL COMPONENT
 * 
 * Reusable modal component class for managing dialog windows.
 * Follows modern JavaScript patterns with encapsulated logic.
 * ============================================================================
 */

class Modal {
    /**
     * Creates a new Modal instance
     * @param {string} modalId - The ID of the modal element
     * @param {Object} options - Configuration options
     * @param {Function} options.onOpen - Callback when modal opens
     * @param {Function} options.onClose - Callback when modal closes
     * @param {boolean} options.closeOnOverlay - Close when clicking overlay (default: true)
     * @param {boolean} options.closeOnEscape - Close when pressing Escape (default: true)
     */
    constructor(modalId, options = {}) {
        this.modalId = modalId;
        this.element = document.getElementById(modalId);

        if (!this.element) {
            console.warn(`Modal: Element with ID "${modalId}" not found`);
            return;
        }

        this.overlay = this.element.querySelector('.modal-overlay');
        this.content = this.element.querySelector('.modal-content');

        // Options with defaults
        this.options = {
            onOpen: options.onOpen || null,
            onClose: options.onClose || null,
            closeOnOverlay: options.closeOnOverlay !== false,
            closeOnEscape: options.closeOnEscape !== false
        };

        // Bind methods
        this._handleOverlayClick = this._handleOverlayClick.bind(this);
        this._handleEscapeKey = this._handleEscapeKey.bind(this);

        // Setup event listeners
        this._setupEvents();
    }

    /**
     * Sets up event listeners for the modal
     * @private
     */
    _setupEvents() {
        // Overlay click
        if (this.overlay && this.options.closeOnOverlay) {
            this.overlay.addEventListener('click', this._handleOverlayClick);
        }

        // Escape key (will be added/removed on open/close)
    }

    /**
     * Handles overlay click
     * @private
     */
    _handleOverlayClick(e) {
        if (e.target === this.overlay) {
            this.close();
        }
    }

    /**
     * Handles Escape key press
     * @private
     */
    _handleEscapeKey(e) {
        if (e.key === 'Escape' && this.isOpen()) {
            this.close();
        }
    }

    /**
     * Opens the modal
     * @returns {Modal} Returns this for chaining
     */
    open() {
        if (!this.element) return this;

        this.element.classList.remove('hidden');

        // Add escape listener when open
        if (this.options.closeOnEscape) {
            document.addEventListener('keydown', this._handleEscapeKey);
        }

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        // Callback
        if (this.options.onOpen) {
            this.options.onOpen(this);
        }

        return this;
    }

    /**
     * Closes the modal
     * @returns {Modal} Returns this for chaining
     */
    close() {
        if (!this.element) return this;

        this.element.classList.add('hidden');

        // Remove escape listener when closed
        document.removeEventListener('keydown', this._handleEscapeKey);

        // Restore body scroll
        document.body.style.overflow = '';

        // Callback
        if (this.options.onClose) {
            this.options.onClose(this);
        }

        return this;
    }

    /**
     * Toggles the modal visibility
     * @returns {Modal} Returns this for chaining
     */
    toggle() {
        return this.isOpen() ? this.close() : this.open();
    }

    /**
     * Checks if the modal is currently open
     * @returns {boolean}
     */
    isOpen() {
        return this.element && !this.element.classList.contains('hidden');
    }

    /**
     * Sets the modal title
     * @param {string} title - The title text
     * @returns {Modal} Returns this for chaining
     */
    setTitle(title) {
        const titleEl = this.element?.querySelector('.modal-title');
        if (titleEl) {
            titleEl.textContent = title;
        }
        return this;
    }

    /**
     * Sets content of an element within the modal
     * @param {string} selector - CSS selector for the target element
     * @param {string} html - HTML content to set
     * @returns {Modal} Returns this for chaining
     */
    setContent(selector, html) {
        const el = this.element?.querySelector(selector);
        if (el) {
            el.innerHTML = html;
        }
        return this;
    }

    /**
     * Sets text content of an element within the modal
     * @param {string} selector - CSS selector for the target element
     * @param {string} text - Text content to set
     * @returns {Modal} Returns this for chaining
     */
    setText(selector, text) {
        const el = this.element?.querySelector(selector);
        if (el) {
            el.textContent = text;
        }
        return this;
    }

    /**
     * Gets the modal element
     * @returns {HTMLElement|null}
     */
    getElement() {
        return this.element;
    }

    /**
     * Adds a button click handler
     * @param {string} buttonId - The ID of the button
     * @param {Function} handler - Click handler function
     * @returns {Modal} Returns this for chaining
     */
    onButtonClick(buttonId, handler) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener('click', handler);
        }
        return this;
    }

    /**
     * Destroys the modal instance and removes event listeners
     */
    destroy() {
        if (this.overlay) {
            this.overlay.removeEventListener('click', this._handleOverlayClick);
        }
        document.removeEventListener('keydown', this._handleEscapeKey);
        document.body.style.overflow = '';
    }
}

// Export for use in other modules
// In a non-module environment, Modal is available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Modal;
}
