describe('SQLite ile Data-Driven (Veri Güdümlü) Yorum Testleri', () => {
    let testUser;
    let dbComments = [];

    before(() => {
        // 1. Veritabanından aktif kullanıcıyı çek
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            testUser = users[0];
        });

        // 2. Veritabanından test için hazırladığımız tüm yorumları bir liste (array) olarak çek
        cy.task('queryDb', 'SELECT comment_body, scenario_type FROM test_comments').then((comments) => {
            dbComments = comments;
        });
    });

    beforeEach(() => {
        // Her veri kümesinden önce hızlıca API login ol
        cy.apiLogin(testUser.email, testUser.password);
    });

    afterEach(function () {
        // Ana test bloğunun genel sonucunu veritabanına logla
        cy.task('insertLog', { testName: this.currentTest.title, status: this.currentTest.state });
    });

    it('Veritabanındaki her bir satır veri için dinamik olarak yorum eklemeli', () => {
        // İlk makaleye git
        cy.visit('/');
        cy.contains('Global Feed').click();
        cy.get('.preview-link').first().click();

        // cy.wrap() ve .each() kullanarak veritabanından gelen her bir satırı döngüye alıyoruz
        cy.wrap(dbComments).each((commentData, index) => {

            // Log ekranında hangi senaryonun çalıştığını görebilmek için başlık yazdırıyoruz
            cy.log(`Çalışan Senaryo #${index + 1}: ${commentData.scenario_type}`);

            // 1. Network Intercept kur (Her döngüde istekleri yakalamak için alias'ı dinamik yapıyoruz)
            const aliasName = `postComment_${index}`;
            cy.intercept('POST', '**/api/articles/*/comments').as(aliasName);

            // 2. Yorum alanını temizle, veritabanından gelen veriyi yaz ve gönder
            cy.get('textarea[placeholder="Write a comment..."]').clear().type(commentData.comment_body);
            cy.get('button[type="submit"]').click();

            // 3. Arka plan ağ doğrulaması (200 OK)
            cy.wait(`@${aliasName}`).then((interception) => {
                expect(interception.response.statusCode).to.eq(200);
            });

            // 4. Arayüz doğrulaması (Yazılan metnin ekranda belirdiğini kontrol et)
            cy.contains(commentData.comment_body).should('be.visible');

            // Performans analizi için ufak bir bekleme (opsiyonel)
            cy.wait(500);
        });
    });
});