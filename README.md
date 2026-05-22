# Conduit Cypress & SQLite E2E Automation Framework

## 🎯 Overview
This repository contains an advanced, enterprise-grade End-to-End (E2E) test automation framework built with **Cypress** and **JavaScript**. Designed for the Conduit (RealWorld) application, this project demonstrates a highly robust architecture by integrating a local **SQLite** database via Cypress Node Events. It moves beyond simple UI testing by incorporating database seeding, Data-Driven Testing (DDT), pure API validation, network traffic interception, and automated test reporting back to the database.

## 🛠️ Tech Stack & Tools
- **Core Framework:** Cypress (v13+)
- **Programming Language:** JavaScript
- **Database:** SQLite3
- **Database IDE:** JetBrains DataGrip
- **Architecture Concepts:** Data-Driven Testing (DDT), Custom Commands, Node Events (`cy.task`), Network Interception (`cy.intercept`), Programmatic Login

## 🏗️ Advanced Architectural Features

### 1. Database Integration & Automated Reporting (SQLite)
The framework connects directly to a local SQLite database (`conduit_test_data.db`) using Cypress `setupNodeEvents`.
- **Data Seeding & Reading:** Test inputs (user credentials, dynamic comment bodies, etc.) are queried directly from the database, eliminating hardcoded test data.
- **Automated Reporting:** Upon test completion, the framework automatically executes an `INSERT` query to log the test execution name, timestamp, and status (Passed/Failed) into a `test_logs` table.

### 2. Data-Driven Testing (DDT)
Leveraging the SQLite connection, the framework implements a robust Data-Driven Testing architecture. Tests dynamically iterate over database records using `cy.wrap().each()`, effectively turning a single test block into a factory that validates various inputs (edge cases, long texts, special characters) against both the UI and backend simultaneously.

### 3. Pure API Automation (Headless CRUD)
To demonstrate testing at the service layer, the framework includes pure API E2E scenarios. It performs complete CRUD (Create, Read, Update, Delete) operations strictly via API requests (`cy.request()`), bypassing the UI entirely for maximum execution speed, and includes negative testing validations (e.g., verifying 404 Not Found after deletion).

### 4. Complex State Management & Regex Assertions
The framework handles real-world user journeys, including DOM traversal, liking articles, and cross-page state validation. It implements bulletproof assertions using **Regex** (Regular Expressions) to effectively handle A/B testing variations and flaky UI elements without test failures.

### 5. Programmatic API Login & UI-Backend Sync
- **Bypassing UI:** A custom command (`cy.apiLogin`) intercepts the authentication flow by sending a direct `POST` request to the backend API. The received JWT token is seamlessly injected into the browser's `localStorage`.
- **Network Interception:** Using `cy.intercept()`, the framework spies on network requests (e.g., `POST /api/articles/*/comments`), asserting that the backend responds with a `200 OK` status before verifying the UI elements, ensuring the application functions flawlessly across all layers.

### 6. ⚙️ How to Run Locally
**Clone the repository => git clone <your-repository-url>

**Install dependencies => npm install

**Open Cypress Test Runner (Interactive Mode) => npx cypress open

**Run tests in Headless Mode => npx cypress run

## 🚀 Project Structure
```text
├── cypress/
│   ├── e2e/
│   │   ├── apiCrud.cy.js             # Pure API tests (CRUD operations)
│   │   ├── backendSync.cy.js         # Main E2E test with DB & Network assertions
│   │   ├── complexSocialFlow.cy.js   # Multi-page DOM traversal & Regex assertions
│   │   └── dataDrivenComments.cy.js  # Data-Driven Testing using SQLite records
│   ├── support/
│   │   ├── commands.js               # Custom commands (e.g., apiLogin)
│   │   └── e2e.js                    # Global configuration
├── cypress.config.js                 # Node events, DB connection tasks (queryDb, insertLog)
├── conduit_test_data.db              # Local SQLite database
└── package.json                      # Node.js dependencies