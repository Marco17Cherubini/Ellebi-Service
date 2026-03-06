# Contributing to LB Service

Welcome to the LB Service project! We appreciate your interest in contributing to our codebase. This document establishes the standards and guidelines for contributing, ensuring high code quality and consistency suitable for a professional environment.

## 🛠 Project Structure

The project follows a modular architecture:

- `frontend/styles/` - CSS Modules (Tokens, Components, Layout, Pages)
- `frontend/js/components/` - Reusable UI components (Classes)
- `server/` - Backend Logic (Express.js)

## 🎨 Code Style & Standards

We use **ESLint** and **Prettier** to enforce code quality and formatting.

### CSS Architecture
We follow the **BEM (Block Element Modifier)** naming convention for all new components.
- **Block**: `.admin-calendar`
- **Element**: `.admin-calendar__cell`
- **Modifier**: `.admin-calendar__cell--active`

CSS is organized into layers:
1. **Tokens**: Global variables (`global.css`, `admin.css`)
2. **Base**: Resets and typography
3. **Components**: Reusable UI elements (`buttons.css`, `cards.css`)
4. **Layout**: Macro structures (`containers.css`)
5. **Pages**: Page-specific overrides

### JavaScript Architecture
- Use **ES6+** features (Classes, Async/Await, Arrow Functions).
- Prefer **Component-based** architecture for UI logic (e.g., `Modal.js`).
- Avoid inline event listeners; use `addEventListener`.

## 🚀 Development Workflow

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```
   Server runs on `http://localhost:3000`.

3. **Linting & Formatting**
   Run the linter to check for issues:
   ```bash
   npm run lint
   ```
   Fix automatic formatting issues:
   ```bash
   npm run format
   ```

## 📝 Commit Guidelines

- Use clear, descriptive commit messages.
- Reference the task/issue ID if applicable.
- Keep commits atomic (one feature/fix per commit).

## 🧪 Testing

- Before submitting, verify your changes manually in the browser.
- Check both **Light Mode** and **Dark Mode** for UI changes.
- Ensure no console errors are present.

Thank you for helping us make LB Service better!
