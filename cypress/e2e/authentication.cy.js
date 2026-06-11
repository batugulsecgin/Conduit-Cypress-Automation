describe('Authentication & Authorization Senaryoları', () => {

    // UYGULAMANIN KENDİNDEN KAYNAKLANAN JS HATALARINI GÖRMEZDEN GELME KOMUTU
    Cypress.on('uncaught:exception', (err, runnable) => {
        // false döndürmek, Cypress'in testi patlatmasını engeller
        return false;
    });

    afterEach(function () {
        // Profesyonel raporlama altyapımızı burada da koruyoruz: Sonuçlar SQLite'a!
        cy.task('insertLog', { testName: this.currentTest.title, status: this.currentTest.state });
    });

    it('Geçersiz email/password ile login denemesi (Negative Test)', () => {
        // 1. Test Verisi: Sistemde kesinlikle olmayan, uydurma bilgiler
        const invalidEmail = `wronguser_${Date.now()}@bondar.com`;
        const invalidPassword = 'WrongPassword123!';

        // 2. Araya Girme (Intercept): Login isteğinin sunucuya gidişini pusuda bekliyoruz
        cy.intercept('POST', '**/api/users/login').as('loginFailed');

        // 3. UI Etkileşimi: Login sayfasına git ve formu hatalı bilgilerle doldur
        cy.visit('/login');
        cy.get('input[placeholder="Email"]').type(invalidEmail);
        cy.get('input[placeholder="Password"]').type(invalidPassword);
        cy.get('button[type="submit"]').click();

        // 4. Backend Doğrulaması: Sunucunun isteği yetkisiz bularak reddettiğini doğrula
        // RealWorld API spesifikasyonlarında hatalı girişler genellikle 403 (Forbidden) veya 422 (Unprocessable Entity) döner
        cy.wait('@loginFailed').its('response.statusCode').should('be.oneOf', [401, 403, 422]);

        // 5. UI Doğrulaması: Kullanıcıya ekranda hata mesajı gösterildiğini teyit et
        // Önceki tecrübelerimizden ders çıkararak tam eşleşme yerine "kapsama" (include) mantığıyla arıyoruz
        cy.get('.error-messages')
            .should('be.visible')
            .and('include.text', 'invalid'); // Genellikle "email or password is invalid" yazar

        // 6. State (Durum) Doğrulaması: Sistemin bizi anasayfaya ALMADIĞINI, hala login sayfasında tuttuğunu kontrol et
        cy.url().should('include', '/login');
    });

});