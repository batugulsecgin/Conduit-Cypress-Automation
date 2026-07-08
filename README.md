# Conduit Cypress & SQLite E2E Automation Framework

## 🎯 Overview
This repository contains an advanced, enterprise-grade End-to-End (E2E) test automation framework built with **Cypress** and **JavaScript**. Designed for the Conduit (RealWorld) application, this project demonstrates a highly robust architecture by integrating a local **SQLite** database via Cypress Node Events. It moves beyond simple UI testing by incorporating database seeding, Data-Driven Testing (DDT), pure API validation, network traffic interception, and automated test reporting back to the database.

![Proje Görüntülenmesi](https://komarev.com/ghpvc/?username=batugulsecgin-conduit-cypress-automation&color=blue)

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

### 6. Security & Vulnerability Testing (Defensive QA)
- **IDOR (Insecure Direct Object Reference):** Validates that users cannot delete articles belonging to others, expecting strict `401/403` backend responses.
- **XSS Prevention:** Injects malicious `<script>` payloads into comment bodies and verifies DOM sanitization using `cy.stub(win, 'alert')`.
- **Unsupported Methods:** Attempts backend-door bypasses (e.g., sending `PUT` requests to endpoints without UI edit buttons) to ensure APIs return `404/405`.

### 7. Performance & Stress Testing
- **Concurrent API Requests:** Bypasses the standard Cypress command queue by utilizing native `window.fetch` and `Promise.all` to bombard the server with 15 simultaneous requests, verifying `200 OK` stability.
- **Rate Limiting (Spam Bot Simulation):** Fires rapid, sequential comments to trigger and validate `429 Too Many Requests` API protections.
- **Payload Stress & Self-Cleanup:** Generates and injects a 10MB+ string into the application. If the server accepts it (Storage Limit vulnerability), the framework executes an immediate `DELETE` request to prevent DOM crashes in subsequent tests.
- **3G Network Throttling:** Intercepts network responses and applies a 3000ms delay (`res.setDelay`) to validate Frontend UX loading states (Skeleton/Spinners).

### 8. Advanced Network Mocking & State Management
- **Response Manipulation:** Intercepts live server responses (`req.continue()`) to inject mock data on the fly, preventing "Test Data Pollution" without breaking E2E flows.
- **Pagination Math:** Mocks backend `articlesCount` to force the UI to render pagination controls, then intercepts the `offset` parameter to mathematically validate routing logic.
- **Ghost Data / Cache Invalidation:** Deletes entities and utilizes `cy.reload()` to ensure aggressive Single Page Application (SPA) caches don't resurrect deleted data.

### 9. ⚙️ How to Run Locally
**Clone the repository => git clone <your-repository-url>

**Install dependencies => npm install

**Open Cypress Test Runner (Interactive Mode) => npx cypress open

**Run tests in Headless Mode => npx cypress run

### 10. 🗄️ Database Setup & Reset (Important!)
**Since this framework relies heavily on data-driven and database-integrated tests, ensuring your local SQLite database has the correct initial state is crucial. If tests fail due to missing records (e.g., after running data deletion tests), reset your database by executing the following SQL script in your database IDE (like DataGrip):

```sql
-- 1. Clear existing comments to avoid duplicates
DELETE FROM test_comments;

-- 2. Seed required data for standard E2E tests
INSERT INTO test_comments (comment_body, scenario_type) 
VALUES ('Bu yorum Cypress ve SQLite kullanılarak veritabanından dinamik olarak çekilmiştir.', 'positive_test');

-- 3. Seed data for Data-Driven Testing (DDT)
INSERT INTO test_comments (comment_body, scenario_type) VALUES 
('Standart kısa bir test yorumu.', 'ddt_normal'),
('🚀 Emojiler içeren 🎉 ve özel karakterler (%#+) barındıran modern bir yorum.', 'ddt_special_chars'),
('Bu yorum alanı, sistemin sınırlarını zorlamak amacıyla bilerek çok uzun bir metin verilerek test edilmektedir.', 'ddt_long_text'),
('1234567890', 'ddt_numeric');
```
## 🚀 Project Structure
```text
├── cypress/
│   ├── e2e/
│   │   ├── authentication.cy.js      # Session timeouts & IDOR security validation
│   │   ├── comments.cy.js            # XSS injection, state isolation, forced edge-cases
│   │   ├── socialFeatures.cy.js      # Toggle states, mathematical UI assertions, Favorites
│   │   ├── feedAndFiltering.cy.js    # Full data mocking, tab transitions, Pagination logic
│   │   ├── performanceAndStress.cy.js# Concurrent Fetch, Rate Limiting, 10MB Payload, 3G Throttling
│   │   └── userManagement.cy.js      # Follow/Unfollow component isolation
│   ├── support/
│   │   ├── commands.js               # Custom commands (e.g., apiLogin)
│   │   └── e2e.js                    # Global configuration hooks
├── cypress.config.js                 # Node events, DB connection tasks (queryDb, insertLog)
├── conduit_test_data.db              # Local SQLite database
└── package.json                      # Node.js dependencies
