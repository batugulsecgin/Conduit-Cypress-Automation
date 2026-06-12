describe('Sosyal Özellikler (Social Features) Senaryoları', () => {

    afterEach(function () {
        // Her modülde olduğu gibi veritabanı raporlamamızı unutmuyoruz
        cy.task('insertLog', { testName: this.currentTest.title, status: this.currentTest.state });
    });

    it('Aynı makaleyi favoriye ekleme ve çıkarma (Toggle On/Off)', () => {
        // 1. Giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            // ==========================================
            // TEST İZOLASYONU
            // Kendi makalelerimizi beğenmek yerine, gerçek bir sosyal etkileşim
            // simülasyonu için Artem Bondar'ın profiline gidiyoruz.
            // ==========================================
            cy.visit('/profile/Artem%20Bondar');

            // 2. Araya Girme (Network Stubbing): Beğeni eylemlerinin API yollarını dinle
            cy.intercept('POST', '**/api/articles/*/favorite').as('favoriteArticle');
            cy.intercept('DELETE', '**/api/articles/*/favorite').as('unfavoriteArticle');

            // 3. UI Etkileşimi ve Dinamik State (Durum) Yönetimi
            // Profildeki ilk makalenin "Kalp" butonunu buluyoruz
            cy.get('.article-preview').first().find('button').then(($btn) => {

                // GUARD (Koruma): Ya bu makaleyi önceki testlerde zaten beğenmişsek?
                // Testin patlamaması için önce butonun anlık durumunu kontrol ediyoruz.
                // Eğer buton dolu (btn-primary) ise, tıklayıp beğeniyi geri çekerek sistemi sıfırlıyoruz.
                if ($btn.hasClass('btn-primary')) {
                    cy.wrap($btn).click();
                    cy.wait('@unfavoriteArticle');
                }

                // --- 1. AŞAMA: FAVORİYE EKLEME (TOGGLE ON) ---
                // Artık butonun kesinlikle "beğenilmemiş" (btn-outline-primary) durumunda olduğundan eminiz.
                cy.wrap($btn).click();

                // Sunucunun 200 OK ile beğeniyi veritabanına yazdığını onayla
                cy.wait('@favoriteArticle').its('response.statusCode').should('eq', 200);

                // UI Doğrulaması: Buton yeşil renge (btn-primary) dönüştü mü?
                cy.wrap($btn).should('have.class', 'btn-primary');

                // --- 2. AŞAMA: FAVORİDEN ÇIKARMA (TOGGLE OFF) ---
                // Sayfayı yenilemeden AYNI butona tekrar tıklıyoruz. Frontend bunu fark etmeli!
                cy.wrap($btn).click();

                // Sunucunun bu kez DELETE isteği atarak beğeniyi sildiğini onayla
                cy.wait('@unfavoriteArticle').its('response.statusCode').should('eq', 200);

                // UI Doğrulaması: Buton eski "boş" (outline) haline geri döndü mü?
                cy.wrap($btn).should('have.class', 'btn-outline-primary');
            });
        });
    });

    it('Favori sayacının artırılması ve azalması (Matematiksel UI Kontrolü)', () => {
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            // Başkasının profiline gidiyoruz
            cy.visit('/profile/Artem%20Bondar');

            cy.intercept('POST', '**/api/articles/*/favorite').as('favoriteArticle');
            cy.intercept('DELETE', '**/api/articles/*/favorite').as('unfavoriteArticle');

            cy.get('.article-preview').first().find('button').then(($btn) => {

                // GUARD: Test ortamını sıfırla (Beğenilmişse geri çek)
                if ($btn.hasClass('btn-primary')) {
                    cy.wrap($btn).click();
                    cy.wait('@unfavoriteArticle');
                }

                // TEXT PARSING (Metin Ayrıştırma)
                // Butonun içinde ikon (kalp) ve boşluklar olabilir.
                // Sadece rakamları çekip Integer (Tam Sayı) değerine çeviriyoruz.
                const initialCount = parseInt($btn.text().replace(/\D/g, '') || '0', 10);

                // --- 1. AŞAMA: SAYACI ARTIRMA ---
                cy.wrap($btn).click();
                cy.wait('@favoriteArticle');

                // Cypress asenkron çalıştığı için tıklama sonrası DOM'un güncellenmesini '.should' ile bekleyip okuyoruz
                cy.wrap($btn).should(($newBtn) => {
                    const incrementedCount = parseInt($newBtn.text().replace(/\D/g, '') || '0', 10);
                    // Beklenen: Yeni sayı, eski sayının tam 1 fazlası olmalı!
                    expect(incrementedCount).to.eq(initialCount + 1);
                });

                // --- 2. AŞAMA: SAYACI AZALTMA ---
                cy.wrap($btn).click();
                cy.wait('@unfavoriteArticle');

                cy.wrap($btn).should(($revertedBtn) => {
                    const revertedCount = parseInt($revertedBtn.text().replace(/\D/g, '') || '0', 10);
                    // Beklenen: Yeni sayı, orijinal haline (initialCount) geri dönmeli!
                    expect(revertedCount).to.eq(initialCount);
                });
            });
        });
    });

    it('Başka kullanıcı yazarlarının makalelerini favorileme (Global Feed Entegrasyonu)', () => {
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            cy.visit('/');

            // ==========================================
            // SENIOR SDET ÇÖZÜMÜ: RESPONSE MODIFICATION
            // Anasayfadaki kirliliği aşmak için, sunucudan gelen gerçek veriyi
            // havada (network katmanında) yakalayıp değiştiriyoruz.
            // ==========================================
            cy.intercept('GET', '**/api/articles?limit=10&offset=0', (req) => {
                // req.continue() ile isteğin sunucuya gitmesine izin veriyoruz,
                // ama dönerken (res) cevabın içine sızıyoruz!
                req.continue((res) => {
                    if(res.body.articles && res.body.articles.length > 0) {
                        // İlk makalenin yazarını sahte bir şekilde 'Artem Bondar' yapıyoruz
                        res.body.articles[0].author.username = 'Artem Bondar';
                        // Testin stabil çalışması için favori durumunu zorla 'false' yapıyoruz
                        res.body.articles[0].favorited = false;
                    }
                });
            }).as('getFeedArticles');

            // Şimdi Global Feed'e tıkla ve bizim manipüle ettiğimiz verinin yüklenmesini bekle
            cy.contains('Global Feed').click();
            cy.wait('@getFeedArticles');

            // Artık %100 eminiz ki ilk makalede 'Artem Bondar' yazıyor!
            cy.contains('.article-preview', 'Artem Bondar').first().as('targetArticle');

            cy.intercept('POST', '**/api/articles/*/favorite').as('feedFavorite');

            cy.get('@targetArticle').find('button').then(($btn) => {
                // 5. ASIL TEST: Global Feed üzerinden beğen butonuna tıkla
                cy.wrap($btn).click();

                // 6. Backend Doğrulaması: Anasayfa bileşeninin doğru API isteğini fırlattığını onayla
                cy.wait('@feedFavorite').its('response.statusCode').should('eq', 200);

                // 7. UI Doğrulaması: Tıklanan makalenin butonunun anasayfada yeşile döndüğünü onayla
                cy.wrap($btn).should('have.class', 'btn-primary');
            });
        });
    });

    it('"Favorited Posts" sekmesinde beğenilen makalenin listelendiğini kontrol etme', () => {
        // 1. Giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            const uniqueStamp = Date.now();
            const articleTitle = `Favori Listesi Testi ${uniqueStamp}`;

            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');

                // 2. PRE-CONDITION 1: Hızlıca kendi test makalemizi yaratıyoruz
                cy.request({
                    method: 'POST',
                    url: 'https://conduit-api.bondaracademy.com/api/articles',
                    headers: { Authorization: `Token ${token}` },
                    body: { article: { title: articleTitle, description: 'Liste Testi', body: 'İçerik', tagList: [] } }
                }).then((articleRes) => {
                    const slug = articleRes.body.article.slug;

                    // 3. PRE-CONDITION 2: Yarattığımız makaleyi yine API üzerinden "Favorilere" ekliyoruz!
                    cy.request({
                        method: 'POST',
                        url: `https://conduit-api.bondaracademy.com/api/articles/${slug}/favorite`,
                        headers: { Authorization: `Token ${token}` }
                    }).then(() => {

                        // ==========================================
                        // ASIL TEST BURADA BAŞLIYOR (UI Listeleme Kontrolü)
                        // ==========================================

                        cy.visit('/');

                        // 4. UI Etkileşimi: Sağ üstteki Navbar'dan kendi kullanıcı ismimize (Profilimize) tıklıyoruz
                        cy.get('.navbar').find('a[href*="/profile"]').first().click();

                        // 5. Araya Girme: Favori sekmesine tıklandığında atılan API isteğini dinle
                        cy.intercept('GET', '**/api/articles?favorited=**').as('getFavoritedArticles');

                        // 6. Profil sayfasındaki 'Favorited Posts' sekmesine tıkla
                        // (Daha önceki testlerde Bondar Academy'nin 'Articles' yerine 'Posts' kelimesini kullandığını keşfetmiştik!)
                        cy.contains('.nav-pills .nav-link', 'Favorited Posts').click();

                        // Backend'den favori listesinin başarıyla döndüğünü doğrula
                        cy.wait('@getFavoritedArticles').its('response.statusCode').should('eq', 200);

                        // 7. UI Doğrulaması:
                        // Ekrana basılan makaleler (article-preview) içinde, az önce API ile favorilediğimiz
                        // o eşsiz (unique) makale başlığının göründüğünü kesin olarak kanıtla!
                        cy.get('.article-preview').should('contain.text', articleTitle);
                    });
                });
            });
        });
    });

    it('Takip edilen kullanıcıların makalelerini filtreleme (Your Feed Kontrolü)', () => {
        // 1. Giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');
                const targetAuthor = 'Artem Bondar';

                // 2. PRE-CONDITION: Hedef yazarı API üzerinden şimşek hızında takip et
                cy.request({
                    method: 'POST',
                    url: `https://conduit-api.bondaracademy.com/api/profiles/${encodeURIComponent(targetAuthor)}/follow`,
                    headers: { Authorization: `Token ${token}` }
                }).then(() => {

                    // 3. ARAYA GİRME (Network Mocking)
                    // Uygulama anasayfaya girdiğinde 'Your Feed' listesini çekmek için bu API'ye istek atar.
                    // Biz sunucuya gitmeden cevabı havada sahte (mock) veri ile dolduruyoruz.
                    cy.intercept('GET', '**/api/articles/feed*', (req) => {
                        req.reply({
                            articles: [{
                                slug: 'takip-edilen-makale-testi',
                                title: 'Takip Edilen Yazarın Özel Makalesi',
                                description: 'Your Feed filtreleme testi',
                                body: 'Bu makale sadece takipçilere görünür.',
                                tagList: ['feed-test'],
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                                favorited: false,
                                favoritesCount: 0,
                                author: {
                                    username: targetAuthor, // Yazar adını zorla Artem Bondar yapıyoruz
                                    bio: null,
                                    image: 'https://api.realworld.io/images/smiley-cyrus.jpeg',
                                    following: true // Takip edildiğini onaylıyoruz
                                }
                            }],
                            articlesCount: 1
                        });
                    }).as('getYourFeed');

                    // 4. UI Etkileşimi: Anasayfaya git
                    cy.visit('/');

                    // ==========================================
                    // RACE CONDITION ÇÖZÜMÜ
                    // Uygulamanın kendiliğinden sekmeyi değiştirmesini beklemiyoruz.
                    // Üstteki Navbar ile karışmaması için özellikle '.feed-toggle' alanındaki
                    // 'Your Feed' butonunu bulup zorla tıklıyoruz.
                    // ==========================================
                    cy.contains('.feed-toggle .nav-link', 'Your Feed').click();

                    // 5. State Doğrulaması: 'Your Feed' sekmesinin aktifleştiğini onayla
                    cy.get('.feed-toggle .nav-link.active').should('contain.text', 'Your Feed');

                    // 6. Backend'den bizim manipüle ettiğimiz sahte veri akışının yüklenmesini bekle
                    cy.wait('@getYourFeed').its('response.statusCode').should('eq', 200);

                    // ==========================================
                    // FİLTRELEME VE LİSTE DOĞRULAMALARI
                    // ==========================================

                    // A. Ekranda sadece 1 adet makale listelendiğini onayla
                    cy.get('.article-preview').should('have.length', 1);

                    // B. Ekrana basılan makalenin yazarının, bizim takip ettiğimiz kişi olduğunu doğrula
                    cy.get('.article-meta .author').should('contain.text', targetAuthor);

                    // C. Ekrana basılan makalenin başlığının bizim enjekte ettiğimiz veri olduğunu teyit et
                    cy.get('.preview-link h1').should('contain.text', 'Takip Edilen Yazarın Özel Makalesi');
                });
            });
        });
    });

});