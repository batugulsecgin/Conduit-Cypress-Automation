# Conduit Cypress & SQLite E2E Automation Framework

## 🎯 Overview
This repository contains an advanced, enterprise-grade End-to-End (E2E) test automation framework built with **Cypress** and **JavaScript**. Designed for the Conduit (RealWorld) application, this project demonstrates a highly robust architecture by integrating a local **SQLite** database via Cypress Node Events. It moves beyond simple UI testing by incorporating database seeding, programmatic API authentication, network traffic interception, and automated test reporting back to the database.

## 🛠️ Tech Stack & Tools
- **Core Framework:** Cypress (v13+)
- **Programming Language:** JavaScript
- **Database:** SQLite3
- **Database IDE:** JetBrains DataGrip
- **Architecture Concepts:** Custom Commands, Node Events (`cy.task`), Network Interception (`cy.intercept`), Programmatic Login

## 🏗️ Advanced Architectural Features

### 1. Database Integration (SQLite & Node Events)
The framework connects directly to a local SQLite database (`conduit_test_data.db`) using Cypress `setupNodeEvents`.
- **Data Seeding & Reading:** Test inputs (like user credentials and dynamic comment bodies) are queried directly from the database, eliminating hardcoded test data.
- **Automated Reporting:** Upon test completion, the framework automatically executes an `INSERT` query to log the test execution name, timestamp, and status (Passed/Failed) into a `test_logs` table.

### 2. Programmatic API Login (Bypassing UI)
To maximize test speed and stability, traditional UI login flows are bypassed.
- A custom command (`cy.apiLogin`) intercepts the authentication flow by sending a direct `POST` request to the backend API.
- The received JWT token is seamlessly injected into the browser's `localStorage` before the page loads, allowing tests to begin in a fully authenticated state instantly.

### 3. Network Interception & UI-Backend Sync
The tests validate not just the UI, but the actual synchronization between the frontend and the backend server.
- Using `cy.intercept()`, the framework spies on the `POST /api/articles/*/comments` network request.
- It asserts that the backend responds with a `200 OK` status before verifying the UI elements, ensuring the application functions flawlessly across all layers.

### 4. ⚙️ How to Run Locally
**Clone the repository => git clone <your-repository-url>

**Install dependencies => npm install

**Open Cypress Test Runner (Interactive Mode) => npx cypress open

**Run tests in Headless Mode => npx cypress run

## 🚀 Project Structure
```text
├── cypress/
│   ├── e2e/
│   │   └── backendSync.cy.js    # Main E2E test with DB & Network assertions
│   ├── support/
│   │   ├── commands.js          # Custom commands (e.g., apiLogin)
│   │   └── e2e.js               # Global configuration
├── cypress.config.js            # Node events, DB connection tasks (queryDb, insertLog)
├── conduit_test_data.db         # Local SQLite database
└── package.json                 # Node.js dependencies