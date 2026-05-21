describe('Veritabanı Entegrasyonu ve UI-Backend Senkronizasyon Testi', () => {
    let testUser;
    let testComment;

    before(() => {
        // Test başlamadan ÖNCE Node.js üzerinden SQLite veritabanımıza sorgu atıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            testUser = users[0]; // İlk aktif kullanıcıyı değişkene ata
        });

        cy.task('queryDb', 'SELECT comment_body FROM test_comments WHERE scenario_type="positive_test"').then((comments) => {
            testComment = comments[0].comment_body; // Eklenecek dinamik yorumu değişkene ata
        });
    });

    beforeEach(() => {
        // Her testten önce API ile saniyeler içinde login ol (UI formunu kullanmıyoruz!)
        cy.apiLogin(testUser.email, testUser.password);
    });

    it('Veritabanından çekilen yorumu eklemeli ve API 200 OK yanıtını doğrulamalı', () => {
        // 1. ARAYA GİRME (Intercept): Backend'e gidecek olan yorum POST isteğini dinlemeye al ve ona 'postComment' adını ver
        cy.intercept('POST', '**/api/articles/*/comments').as('postComment');

        // 2. Anasayfaya git ve Global Feed sekmesindeki ilk makaleye tıkla
        cy.contains('Global Feed').click();
        cy.get('.preview-link').first().click();

        // 3. Yorum alanını bul, veritabanından gelen veriyi yaz ve Gönder (Post Comment) butonuna bas
        cy.get('textarea[placeholder="Write a comment..."]').type(testComment);
        cy.get('button[type="submit"]').click();

        // 4. BACKEND DOĞRULAMASI: Araya girdiğimiz isteğin sunucuya ulaştığını ve Başarılı (200) döndüğünü kanıtla
        cy.wait('@postComment').then((interception) => {
            expect(interception.response.statusCode).to.eq(200);
        });

        // 5. UI DOĞRULAMASI: Sunucu onayladıktan sonra yazının arayüzde (ekranda) görünür olduğunu teyit et
        cy.contains(testComment).should('be.visible');
    });

    // Test senaryosu tamamlandıktan HEMEN SONRA çalışır
    afterEach(function () {
        // Cypress'in iç mimarisinden testin adını ve sonucunu (passed/failed) yakalıyoruz
        const currentTestName = this.currentTest.title;
        const currentTestState = this.currentTest.state;

        // Verileri Node.js'teki yeni task'ımıza gönderip veritabanına yazdırıyoruz
        cy.task('insertLog', { testName: currentTestName, status: currentTestState });
    });
});