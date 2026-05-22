describe('Saf API Üzerinden CRUD Operasyonu', () => {
    let testUser;
    let authToken;

    before(() => {
        // 1. Veritabanından testimiz için aktif kullanıcıyı çekiyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            testUser = users[0];

            // 2. UI arayüzünü hiç açmadan, doğrudan API üzerinden login olup Token'ı cebimize koyuyoruz
            cy.request({
                method: 'POST',
                url: 'https://conduit-api.bondaracademy.com/api/users/login',
                body: { user: { email: testUser.email, password: testUser.password } }
            }).then((response) => {
                authToken = response.body.user.token;
            });
        });
    });

    afterEach(function () {
        // Test bittiğinde sonucunu (passed/failed) DataGrip'teki log tablomuza yazdırıyoruz
        cy.task('insertLog', { testName: this.currentTest.title, status: this.currentTest.state });
    });

    it('API üzerinden makale oluşturmalı (POST), doğrulamalı (GET) ve silmeli (DELETE)', () => {
        const uniqueTitle = `API Otomasyonu ${Date.now()}`;

        // ==========================================
        // ADIM 1: CREATE (Yeni Makale Oluşturma)
        // ==========================================
        cy.request({
            method: 'POST',
            url: 'https://conduit-api.bondaracademy.com/api/articles',
            headers: { Authorization: `Token ${authToken}` }, // Giriş kartımızı (Token) sunucuya gösteriyoruz
            body: {
                article: {
                    title: uniqueTitle,
                    description: 'Tamamen API üzerinden test edildi',
                    body: 'Cypress cy.request() komutunun gücü!',
                    tagList: ['api', 'cypress']
                }
            }
        }).then((response) => {
            // Sunucunun "Başarıyla Oluşturuldu" (201) kodu döndüğünü doğrula
            expect(response.status).to.eq(201);
            expect(response.body.article.title).to.eq(uniqueTitle);

            // Sunucunun makaleye atadığı URL uzantısını (slug) Cypress hafızasına (Alias) al
            cy.wrap(response.body.article.slug).as('articleSlug');
        });

        // ==========================================
        // ADIM 2: READ (Makaleyi Görüntüleme)
        // ==========================================
        cy.get('@articleSlug').then((slug) => {
            cy.request({
                method: 'GET',
                url: `https://conduit-api.bondaracademy.com/api/articles/${slug}`
            }).then((response) => {
                // Makalenin gerçekten veritabanına yazıldığını doğrula
                expect(response.status).to.eq(200);
                expect(response.body.article.title).to.eq(uniqueTitle);
            });
        });

        // ==========================================
        // ADIM 3: DELETE (Makaleyi Silme - Temizlik)
        // ==========================================
        cy.get('@articleSlug').then((slug) => {
            cy.request({
                method: 'DELETE',
                url: `https://conduit-api.bondaracademy.com/api/articles/${slug}`,
                headers: { Authorization: `Token ${authToken}` }
            }).then((response) => {
                // Silme işleminin başarılı olduğunu (200 veya 204 No Content) doğrula
                expect(response.status).to.be.oneOf([200, 204]);
            });
        });

        // ==========================================
        // ADIM 4: DOĞRULAMA (Negatif Test)
        // ==========================================
        cy.get('@articleSlug').then((slug) => {
            cy.request({
                method: 'GET',
                url: `https://conduit-api.bondaracademy.com/api/articles/${slug}`,
                failOnStatusCode: false // 404 hatası almayı BEKLEDİĞİMİZ için testi patlatmasını engelliyoruz
            }).then((response) => {
                // Silinen makale tekrar çağırıldığında sunucu 404 (Bulunamadı) dönmeli!
                expect(response.status).to.eq(404);
            });
        });
    });
});