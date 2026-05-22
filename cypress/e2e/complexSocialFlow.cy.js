describe('Kapsamlı E2E: Makale Yaşam Döngüsü ve Sosyal Etkileşimler', () => {
    let testUser;

    before(() => {
        // Veritabanından kullanıcıyı çekiyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            testUser = users[0];
        });
    });

    beforeEach(() => {
        // UI'ı atlayıp saniyeler içinde login oluyoruz
        cy.apiLogin(testUser.email, testUser.password);
    });

    afterEach(function () {
        // Testin sonucunu veritabanındaki log tablosuna yazdırıyoruz
        cy.task('insertLog', { testName: this.currentTest.title, status: this.currentTest.state });
    });

    it('Makale oluşturmalı, favorilere eklemeli, profilde görmeli ve temizlemeli', () => {
        // Her test koşumunda çakışmayı önlemek için benzersiz bir başlık üretiyoruz
        const uniqueTimestamp = Date.now();
        const articleTitle = `Kompleks E2E Otomasyon ${uniqueTimestamp}`;
        const articleDesc = 'Cypress ile Çok Sayfalı Sosyal Test';
        const articleBody = 'Bu test, uygulamanın UI tarafındaki birçok farklı sekmesini ve durumunu (state) kontrol eder.';
        const articleTag = 'advanced-cypress';

        // ==========================================
        // 1. AŞAMA: MAKALEYİ OLUŞTURMA (UI)
        // ==========================================
        cy.visit('/editor');
        cy.get('input[placeholder="Article Title"]').type(articleTitle);
        cy.get('input[placeholder="What\'s this article about?"]').type(articleDesc);
        cy.get('textarea[placeholder="Write your article (in markdown)"]').type(articleBody);
        cy.get('input[placeholder="Enter tags"]').type(`${articleTag}{enter}`);
        cy.get('button[type="button"]').contains('Publish Article').click();

        // Makale detay sayfasına başarıyla geçtiğimizi doğrula
        cy.get('h1').should('contain', articleTitle);

        // ==========================================
        // 2. AŞAMA: ANASAYFA VE FAVORİYE EKLEME
        // ==========================================
        cy.visit('/');
        cy.contains('Global Feed').click();

        // Cypress'in güçlü DOM Traversal yeteneği:
        // Sadece bizim makalemizin olduğu bloğu (article-preview) bul, içindeki Favori butonuna tıkla
        cy.intercept('POST', '**/api/articles/*/favorite').as('favoriteArticle');

        cy.contains('.article-preview', articleTitle)
            .find('button.btn-outline-primary')
            .click();

        // Arka planda favori ekleme isteğinin başarılı (200 OK) olduğunu doğrula
        cy.wait('@favoriteArticle').its('response.statusCode').should('eq', 200);


        // ==========================================
        // ==========================================
        // 3. AŞAMA: PROFİL SAYFASI ÇAPRAZ KONTROLLERİ
        // ==========================================
        cy.get('.navbar a[href*="/profile"]').click();

        // REGEX GÜCÜ: "My Articles" veya "My Posts" ikisini de kabul et!
        cy.contains(/My (Articles|Posts)/).should('be.visible');
        cy.contains('.preview-link', articleTitle).should('be.visible');

        // REGEX GÜCÜ: "Favorited Articles" veya "Favorited Posts" ikisini de kabul et!
        cy.contains(/Favorited (Articles|Posts)/).click();
        cy.contains('.preview-link', articleTitle).should('be.visible');

        // ==========================================
        // 4. AŞAMA: TEARDOWN (Temizlik İşlemi)
        // ==========================================
        // Profil sayfasındaki makalemize tekrar tıklayıp içine giriyoruz
        cy.contains('.preview-link', articleTitle).click();

        // Silme butonuna basarak veritabanında kalabalık yapmasını engelliyoruz
        cy.get('.article-actions').contains('Delete Article').click();

        // Uygulamanın makaleyi sildikten sonra bizi anasayfaya yönlendirdiğini doğrula
        cy.url().should('eq', 'https://conduit.bondaracademy.com/');
        cy.contains('Global Feed').should('be.visible');
    });
});