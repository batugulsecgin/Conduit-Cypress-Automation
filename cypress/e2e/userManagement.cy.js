describe('User Management (Kullanıcı Yönetimi) Senaryoları', () => {

    afterEach(function () {
        // Kurduğumuz profesyonel altyapıyı koruyoruz: Test sonuçları SQLite veritabanına loglanacak
        cy.task('insertLog', { testName: this.currentTest.title, status: this.currentTest.state });
    });

    it('Yeni kullanıcı kaydı (Registration) - Happy path', () => {
        // 1. Dinamik Veri Üretimi: Her koşumda benzersiz bir kullanıcı oluşturuyoruz
        const uniqueTimestamp = Date.now();
        const testUsername = `User_${uniqueTimestamp}`;
        const testEmail = `test_${uniqueTimestamp}@bondar.com`;
        const testPassword = 'StrongPassword123!';

        // 2. Araya Girme (Intercept): Kayıt isteğinin sunucuya gidişini dinlemeye alıyoruz
        cy.intercept('POST', '**/api/users').as('registerUser');

        // 3. UI Etkileşimi: Kayıt sayfasına git ve formu doldur
        cy.visit('/register');
        cy.get('input[placeholder="Username"]').type(testUsername);
        cy.get('input[placeholder="Email"]').type(testEmail);
        cy.get('input[placeholder="Password"]').type(testPassword);
        cy.get('button[type="submit"]').click();

        // 4. Doğrulamalar (Assertions)
        // Backend'in bu yeni kaydı gerçekten kabul ettiğini (200 OK veya 201 Created) teyit et
        cy.wait('@registerUser').its('response.statusCode').should('be.oneOf', [200, 201]);

        // Sistemin bizi başarılı kayıt sonrası Anasayfaya yönlendirdiğini doğrula
        cy.url().should('eq', 'https://conduit.bondaracademy.com/');

        // Sağ üstteki navigasyon barında yeni kullanıcı adımızın belirdiğini kontrol et
        cy.get('.navbar').should('contain', testUsername);
    });
    it('Duplicate email ile kayıt denemesi (Negative Test)', () => {
        // 1. Veri Hazırlığı: Veritabanımızdan zaten kayıtlı olan bir kullanıcının e-postasını çekiyoruz
        cy.task('queryDb', 'SELECT email FROM users WHERE status="active"').then((users) => {
            const existingEmail = users[0].email; // Sistemde zaten var olan e-posta

            // Date.now() string'e çevrilip slice(-5) ile sadece son 5 rakamı alınıyor (Örn: Batu_31219)
            // Kullanıcı adı farklı olsa bile e-posta aynı olacağı için sistem reddetmeli
            const randomUsername = `Batu_${Date.now().toString().slice(-5)}`;

            // 2. Araya Girme (Intercept): API'nin hata döneceğini bildiğimiz için o anı pusuya yatıp bekliyoruz
            cy.intercept('POST', '**/api/users').as('registerFailed');

            // 3. UI Etkileşimi: Kayıt sayfasına git ve formu 'kullanılmış' e-posta ile doldur
            cy.visit('/register');
            cy.get('input[placeholder="Username"]').type(randomUsername);
            cy.get('input[placeholder="Email"]').type(existingEmail);
            cy.get('input[placeholder="Password"]').type('TestPassword123!');
            cy.get('button[type="submit"]').click();

            // 4. Doğrulamalar (Assertions)
            // BACKEND DOĞRULAMASI: Sunucunun çökmek yerine "422 Unprocessable Entity" (İşlenemeyen İçerik) kodu döndüğünü doğrula
            cy.wait('@registerFailed').its('response.statusCode').should('eq', 422);

            // UI DOĞRULAMASI: Kullanıcıya ekranda hata mesajının gösterildiğini teyit et
            // Büyük/küçük harf veya başlık kelimesine takılmamak için sadece "has already been taken" kısmını arıyoruz
            cy.get('.error-messages')
                .should('be.visible')
                .and('include.text', 'has already been taken');

            // URL DOĞRULAMASI: Kullanıcının anasayfaya yönlendirilmediğini, kayıt sayfasında kaldığını kontrol et
            cy.url().should('include', '/register');
        });
    });

    it('Şifre sıfırlama/güncelleme flow ve yeni şifreyle giriş (Teardown)', () => {
        // 1. Veritabanından aktif kullanıcımızı çekiyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            const newPassword = 'NewPassword123!_Updated'; // Uygulanacak yeni geçici şifre

            // 2. Sisteme hızlıca API üzerinden giriş yap
            cy.apiLogin(user.email, user.password);

            // 3. Ayarlar (Settings) sayfasına git
            cy.visit('/settings');

            // 4. Şifre alanını doldur ve formu kaydet
            cy.intercept('PUT', '**/api/user').as('updateUser');
            cy.get('input[placeholder="New Password"]').type(newPassword); // "Password" yerine "New Password" yaptık!
            cy.get('button[type="submit"]').contains('Update Settings').click();

            // 5. Backend Doğrulaması: Şifre güncelleme isteği başarılı (200 OK) döndü mü?
            cy.wait('@updateUser').its('response.statusCode').should('eq', 200);

            // 6. Çıkış Yap (Programmatic Logout - Tarayıcı hafızasını temizleyerek şimşek hızında çıkış)
            cy.clearLocalStorage();

            // 7. Yeni Şifre ile Giriş Doğrulaması (Relogin)
            cy.visit('/login');
            cy.get('input[placeholder="Email"]').type(user.email);
            cy.get('input[placeholder="Password"]').type(newPassword); // Yeni şifreyi kullanıyoruz!
            cy.get('button[type="submit"]').click();

            // Sisteme başarıyla girildiğini kontrol et (Ayarlar sekmesi görünür olmalı)
            cy.contains('.nav-link', 'Settings').should('be.visible');

            // 8. TEARDOWN (Temizlik): Testin tekrarlanabilirliği için şifreyi eski haline döndür!
            // Bunu arayüzü yormadan, doğrudan API üzerinden yapıyoruz.
            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');
                cy.request({
                    method: 'PUT',
                    url: 'https://conduit-api.bondaracademy.com/api/user',
                    headers: { Authorization: `Token ${token}` },
                    body: { user: { password: user.password } } // Veritabanımızdaki orijinal şifre
                });
            });
        });
    });

    it('Profil güncelleme (Bio ve Avatar) ve arayüz doğrulaması', () => {
        // 1. Veritabanından aktif kullanıcımızı çekiyoruz (Sorun çıkaran "username" sütununu sildik!)
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];

            // Dinamik test verilerimiz
            const newBio = `Bu profil Cypress otomasyonu tarafından ${Date.now()} anında güncellenmiştir. Agile & Clean Code!`;
            const newAvatarUrl = 'https://api.realworld.io/images/smiley-cyrus.jpeg';

            // 2. API üzerinden hızlı giriş ve Ayarlar sayfasına gidiş
            cy.apiLogin(user.email, user.password);
            cy.visit('/settings');

            // 3. Araya Girme (Intercept)
            cy.intercept('PUT', '**/api/user').as('updateProfile');

            // 4. Form İşlemleri
            cy.get('input[placeholder="URL of profile picture"]').clear().type(newAvatarUrl);
            cy.get('textarea[placeholder="Short bio about you"]').clear().type(newBio);
            cy.get('button[type="submit"]').contains('Update Settings').click();

            // 5. Backend Doğrulaması
            cy.wait('@updateProfile').its('response.statusCode').should('eq', 200);

            // 6. Frontend / UI Doğrulamaları
            // Username'i DB'den almak yerine, uygulamanın bizi profil dizinine yönlendirdiğini doğruluyoruz
            cy.url().should('include', '/profile/');

            // Yazdığımız yeni Bio metninin profil sayfasında görünür olduğunu doğrula
            cy.contains(newBio).should('be.visible');

            // Avatar görselinin güncellendiğini doğrula
            cy.get('.user-img').should('have.attr', 'src', newAvatarUrl);
        });
    });

    it('Kullanıcıyı takip etme ve takibi bırakma (Follow/Unfollow) akışı', () => {
        // 1. Veritabanından aktif kullanıcımızı çek ve sisteme gir
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            // 2. Rastgele bir yazar bulmak için Global Feed'e git ve ilk makalenin yazarına tıkla
            cy.visit('/');
            cy.contains('Global Feed').click();
            cy.get('.article-meta .author').first().click();

            // 3. Ağ isteklerini dinlemeye al (Follow ve Unfollow API call'ları)
            cy.intercept('POST', '**/api/profiles/*/follow').as('followUser');
            cy.intercept('DELETE', '**/api/profiles/*/follow').as('unfollowUser');

            // 4. Takip Et / Bırak Butonunu (action-btn) bul ve dinamik state (durum) kontrolü yap
            cy.get('button.action-btn').then(($btn) => {
                const buttonText = $btn.text();

                // Eğer kullanıcı zaten takip ediliyorsa (Unfollow yazıyorsa), önce takibi bırakarak sistemi sıfırla
                if (buttonText.includes('Unfollow')) {
                    cy.wrap($btn).click();
                    cy.wait('@unfollowUser');
                }

                // ==========================================
                // ASIL TEST BAŞLIYOR: ŞU AN KESİNLİKLE "FOLLOW" DURUMUNDAYIZ
                // ==========================================

                // A. TAKİP ET (FOLLOW)
                cy.get('button.action-btn').should('contain.text', 'Follow').click();

                // Backend'in takip işlemini onayladığını (200 OK) doğrula
                cy.wait('@followUser').its('response.statusCode').should('eq', 200);

                // UI'ın anında değişip "Unfollow" (Takibi Bırak) olduğunu doğrula
                cy.get('button.action-btn').should('contain.text', 'Unfollow');

                // B. TAKİBİ BIRAK (UNFOLLOW - TEARDOWN)
                cy.get('button.action-btn').click();

                // Backend'in takibi bırakma işlemini onayladığını doğrula
                cy.wait('@unfollowUser').its('response.statusCode').should('eq', 200);

                // Sistemin eski haline dönüp butonun tekrar "Follow" olduğunu doğrula
                cy.get('button.action-btn').should('contain.text', 'Follow');
            });
        });
    });
});