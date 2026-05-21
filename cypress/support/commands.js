// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
// Arayüzü (UI) tamamen bypass edip direkt Backend üzerinden login olan özel komut
Cypress.Commands.add('apiLogin', (email, password) => {
    // Frontend ile Backend domainleri farklı! Gerçek API URL'lerini tanımlıyoruz
    const loginUrl = 'https://conduit-api.bondaracademy.com/api/users/login';
    const registerUrl = 'https://conduit-api.bondaracademy.com/api/users';

    // 1. API'ye Login olmayı dene
    cy.request({
        method: 'POST',
        url: loginUrl,
        body: { user: { email, password } },
        failOnStatusCode: false // Hata alırsak testi patlatma, biz müdahale edeceğiz
    }).then((response) => {

        // 2. Cypress Best Practice: Siteyi yüklerken (onBeforeLoad) token'ı içeri sızdırma
        const injectTokenAndVisit = (token) => {
            cy.visit('/', {
                onBeforeLoad(win) {
                    win.localStorage.setItem('jwtToken', token);
                }
            });
        };

        if (response.status === 200 || response.status === 201) {
            // Kullanıcı zaten sunucuda varsa direkt token'ı al ve siteyi aç
            injectTokenAndVisit(response.body.user.token);
        } else {
            // 3. Kullanıcı sunucuda yoksa (Sadece yerel SQLite'ımızdaysa), anında yeni kayıt (Register) oluştur!
            cy.request({
                method: 'POST',
                url: registerUrl,
                body: { user: { username: `SDET_${Date.now()}`, email: email, password: password } }
            }).then((regResponse) => {
                injectTokenAndVisit(regResponse.body.user.token);
            });
        }
    });
});