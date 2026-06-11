describe('Yorumlar (Comments) Senaryoları', () => {

    afterEach(function () {
        // Raporlama mekanizmamızı yeni dosyamızda da sürdürüyoruz
        cy.task('insertLog', { testName: this.currentTest.title, status: this.currentTest.state });
    });

    it('Yorum silme (DELETE comment) - UI ve API entegrasyonu', () => {
        // 1. Veritabanından giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            const uniqueStamp = Date.now();
            const commentText = `Bu yorum silinme testi için yaratılmıştır. ID: ${uniqueStamp}`;

            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');

                // 2. PRE-CONDITION 1: İzole bir test ortamı için API'den arka planda makale yarat!
                cy.request({
                    method: 'POST',
                    url: 'https://conduit-api.bondaracademy.com/api/articles',
                    headers: { Authorization: `Token ${token}` },
                    body: {
                        article: {
                            title: `Yorum Silme Testi ${uniqueStamp}`,
                            description: 'Yorum modülü testi',
                            body: 'İçerik',
                            tagList: ['comment-test']
                        }
                    }
                }).then((articleRes) => {
                    const slug = articleRes.body.article.slug;

                    // 3. PRE-CONDITION 2: API'den o makalenin içine yorumu ekle!
                    cy.request({
                        method: 'POST',
                        url: `https://conduit-api.bondaracademy.com/api/articles/${slug}/comments`,
                        headers: { Authorization: `Token ${token}` },
                        body: { comment: { body: commentText } }
                    }).then(() => {

                        // ==========================================
                        // ASIL TEST BURADA BAŞLIYOR (Sadece UI Silme Testi)
                        // ==========================================

                        // 4. Makalenin detay sayfasına git
                        cy.visit(`/article/${slug}`);

                        // 5. Yorumun ekranda başarıyla render edildiğini doğrula
                        cy.contains('.card-text', commentText).should('be.visible');

                        // 6. Araya Girme: Silme butonuna basıldığında gidecek isteği dinle
                        // Yorum ID'si dinamik olduğu için sonunu wildcard (*) ile bırakıyoruz
                        cy.intercept('DELETE', `**/api/articles/${slug}/comments/*`).as('deleteComment');

                        // 7. UI Etkileşimi: Yorum kutusunu bul ve içindeki 'Çöp Tenekesi' (ion-trash-a) ikonuna tıkla
                        cy.contains('.card', commentText).find('.ion-trash-a').click();

                        // 8. Backend Doğrulaması: Sunucunun silme işlemini 200 OK ile onayladığını doğrula
                        cy.wait('@deleteComment').its('response.statusCode').should('eq', 200);

                        // 9. UI (Arayüz) Doğrulaması: Yorumun sayfadan tamamen silindiğini doğrula
                        cy.contains('.card-text', commentText).should('not.exist');
                    });
                });
            });
        });
    });

    it('Yorum düzenleme (PUT/PATCH) - Desteklenmeyen Endpoint Güvenlik Testi', () => {
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            const uniqueStamp = Date.now();
            const originalComment = `Orijinal, değiştirilmemesi gereken yorum. ID: ${uniqueStamp}`;
            const hackerComment = 'Hacker bu yorumu API üzerinden değiştirdi!';

            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');

                // 1. Makale yarat
                cy.request({
                    method: 'POST',
                    url: 'https://conduit-api.bondaracademy.com/api/articles',
                    headers: { Authorization: `Token ${token}` },
                    body: { article: { title: `Edit Comment Test ${uniqueStamp}`, description: 'Negatif Test', body: 'İçerik', tagList: [] } }
                }).then((articleRes) => {
                    const slug = articleRes.body.article.slug;

                    // 2. Makaleye Orijinal Yorumu Ekle
                    cy.request({
                        method: 'POST',
                        url: `https://conduit-api.bondaracademy.com/api/articles/${slug}/comments`,
                        headers: { Authorization: `Token ${token}` },
                        body: { comment: { body: originalComment } }
                    }).then((commentRes) => {
                        // Sunucunun yoruma atadığı benzersiz ID'yi alıyoruz
                        const commentId = commentRes.body.comment.id;

                        // ==========================================
                        // SIZMA DENEMESİ (API Güvenlik Testi)
                        // ==========================================

                        // 3. Olmayan bir özelliği (Yorum Düzenleme - PUT) zorlayarak API'ye istek atıyoruz
                        cy.request({
                            method: 'PUT', // REST standartlarında düzenleme PUT veya PATCH ile yapılır
                            url: `https://conduit-api.bondaracademy.com/api/articles/${slug}/comments/${commentId}`,
                            headers: { Authorization: `Token ${token}` },
                            body: { comment: { body: hackerComment } },
                            failOnStatusCode: false // Hata fırlatmasını BEKLİYORUZ, testi durdurma!
                        }).then((putRes) => {
                            // 4. Backend Doğrulaması:
                            // Sunucu "Ben böyle bir işlem (PUT) bilmiyorum" diyerek
                            // 404 (Not Found) veya 405 (Method Not Allowed) dönmelidir. Çökmemelidir (500).
                            expect(putRes.status).to.be.oneOf([404, 405]);
                        });

                        // 5. UI (Arayüz) Doğrulaması:
                        // Sadece API'ye güvenmiyoruz. Arayüze gidip yorumun gerçekten DEĞİŞMEDİĞİNİ kanıtlıyoruz.
                        cy.visit(`/article/${slug}`);

                        // Orijinal yorum ekranda olmalı
                        cy.contains('.card-text', originalComment).should('be.visible');

                        // Hacker'ın yazdığı yorum kesinlikle DOM'da bulunmamalı
                        cy.contains('.card-text', hackerComment).should('not.exist');
                    });
                });
            });
        });
    });

    it('Aynı makaleye ardışık çoklu yorum ekleme senaryosu', () => {
        // 1. Giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            const uniqueStamp = Date.now();
            const firstComment = `İlk Yorum - Sistem Kontrolü ${uniqueStamp}`;
            const secondComment = `İkinci Yorum - Durum Yönetimi Kontrolü ${uniqueStamp}`;

            // 2. PRE-CONDITION: Makaleyi API üzerinden şimşek hızında yarat
            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');
                cy.request({
                    method: 'POST',
                    url: 'https://conduit-api.bondaracademy.com/api/articles',
                    headers: { Authorization: `Token ${token}` },
                    body: { article: { title: `Çoklu Yorum Testi ${uniqueStamp}`, description: 'State kontrolü', body: 'İçerik', tagList: [] } }
                }).then((response) => {
                    const slug = response.body.article.slug;

                    // 3. UI Etkileşimi: Makale detay sayfasına git
                    cy.visit(`/article/${slug}`);

                    // ==========================================
                    // ARDIŞIK YORUM AKIŞI (Sequential Posting)
                    // ==========================================

                    // 4. BİRİNCİ YORUMU GÖNDER
                    cy.intercept('POST', `**/api/articles/${slug}/comments`).as('postComment1');
                    cy.get('textarea[placeholder="Write a comment..."]').type(firstComment);
                    cy.get('button[type="submit"]').contains('Post Comment').click();

                    // İlk yorumun sunucudan başarıyla döndüğünü bekle
                    cy.wait('@postComment1').its('response.statusCode').should('be.oneOf', [200, 201]);

                    // Kırılganlığı önlemek için ilk yorumun arayüze düştüğünü teyit et
                    cy.contains('.card-text', firstComment).should('be.visible');

                    // 5. İKİNCİ YORUMU GÖNDER (Sayfayı yenilemeden hemen arkasından!)
                    cy.intercept('POST', `**/api/articles/${slug}/comments`).as('postComment2');

                    // Üst üste ekleme yaparken input alanının temizlenmiş olması gerekir. Cypress ile doğrudan yazıyoruz.
                    cy.get('textarea[placeholder="Write a comment..."]').type(secondComment);
                    cy.get('button[type="submit"]').contains('Post Comment').click();

                    // İkinci yorumun da sunucu barajını geçtiğini doğrula
                    cy.wait('@postComment2').its('response.statusCode').should('be.oneOf', [200, 201]);

                    // ==========================================
                    // LİSTE VE DURUM DOĞRULAMALARI (Assertions)
                    // ==========================================

                    // 6. Ekranda şu an tam olarak 2 adet yorum kartı listelendiğini doğrula
                    cy.get('.card-text').should('have.length', 2);

                    // 7. İki farklı yorum metninin de DOM içinde güvenle yer aldığını teyit et
                    // Sıralamadan (en yeni mi, en eski mi üstte) bağımsız, ikisinin de varlığını izole kontrol ediyoruz
                    cy.contains('.card-text', firstComment).should('be.visible');
                    cy.contains('.card-text', secondComment).should('be.visible');
                });
            });
        });
    });

    it('HTML içeren yorum (XSS prevention) - Siber Güvenlik Testi', () => {
        // 1. Giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            const uniqueStamp = Date.now();

            // 2. Zararlı XSS Yükü (Payload)
            // İçinde hem çalışan bir script, hem bozuk bir resim tag'i, hem de kalın yazı tag'i var
            const xssComment = `<script>alert("Yorumlara sızıldı!")</script> <img src="x" onerror="alert('Resim Hatası')"> <b>Zararlı yorum</b> ${uniqueStamp}`;

            // 3. Tarayıcı Olaylarını Yakalama (Sistem hacklenirse alert fırlayacak!)
            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');
                cy.stub(win, 'alert').as('windowAlert');

                // 4. PRE-CONDITION: Temiz bir test ortamı için API'den makale yarat
                cy.request({
                    method: 'POST',
                    url: 'https://conduit-api.bondaracademy.com/api/articles',
                    headers: { Authorization: `Token ${token}` },
                    body: { article: { title: `Yorum XSS Testi ${uniqueStamp}`, description: 'Güvenlik', body: 'İçerik', tagList: [] } }
                }).then((response) => {
                    const slug = response.body.article.slug;

                    // 5. UI Etkileşimi: Makalenin detay sayfasına git
                    cy.visit(`/article/${slug}`);

                    // ==========================================
                    // SIZMA DENEMESİ (Injection)
                    // ==========================================

                    // 6. Yorum kutusuna XSS kodunu yapıştır ve gönder
                    cy.intercept('POST', `**/api/articles/${slug}/comments`).as('postXssComment');
                    cy.get('textarea[placeholder="Write a comment..."]').type(xssComment);
                    cy.get('button[type="submit"]').contains('Post Comment').click();

                    // Sunucunun yorumu kabul ettiğini doğrula (Buraya kadar normal)
                    cy.wait('@postXssComment').its('response.statusCode').should('be.oneOf', [200, 201]);

                    // ==========================================
                    // GÜVENLİK DOĞRULAMALARI (Security Assertions)
                    // ==========================================

                    // A. JavaScript Enjeksiyon Kontrolü:
                    // O meşhur 'alert' penceresi HİÇ çağrılmamış olmalı!
                    cy.get('@windowAlert').should('not.have.been.called');

                    // B. DOM (Document Object Model) Kontrolü:
                    // Yorum eklendiğinde, ekrana basılan kartın içinde <script> etiketi GİZLİCE çalışıyor olmamalı.
                    cy.get('.card-text').last().then(($commentBody) => {
                        // JQuery kullanarak yorumun içindeki script tag'lerini sayıyoruz. 0 olmalı!
                        expect($commentBody.find('script').length).to.eq(0);
                    });

                    // C. UI Metin Doğrulaması:
                    // Sistem güvenlik gereği ya HTML etiketlerini tamamen silmiştir ya da düz metin (string) olarak basmıştır.
                    // Yorum kartının ekranda var olduğunu ama kodu çalıştırmadığını teyit ediyoruz.
                    cy.get('.card-text').last().should('be.visible');
                });
            });
        });
    });

    it('Boş yorum gönderme denemesi (Validation Edges & Forced Bypass)', () => {
        // 1. Giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');
                const uniqueStamp = Date.now();

                // 2. PRE-CONDITION: Temiz bir test ortamı için API'den makale yarat
                cy.request({
                    method: 'POST',
                    url: 'https://conduit-api.bondaracademy.com/api/articles',
                    headers: { Authorization: `Token ${token}` },
                    body: { article: { title: `Boş Yorum Testi ${uniqueStamp}`, description: 'Validation', body: 'İçerik', tagList: [] } }
                }).then((response) => {
                    const slug = response.body.article.slug;

                    // 3. UI Etkileşimi: Makale detay sayfasına git
                    cy.visit(`/article/${slug}`);

                    // 4. Araya Girme: Boş yorum isteğini dinlemeye alıyoruz
                    cy.intercept('POST', `**/api/articles/${slug}/comments`).as('postEmptyComment');

                    // 5. ZORUNLU EYLEM (Forced Action)
                    // Kutunun içine sadece tıklıyoruz (yazı yazmıyoruz) ve temiz olduğundan emin oluyoruz.
                    cy.get('textarea[placeholder="Write a comment..."]').focus().clear();

                    // Frontend "Gönder" butonunu disable etmiş olsa bile, { force: true } ile Cypress'e
                    // "Engelleri umursama, o butona zorla bas!" emrini veriyoruz. Bu tam bir güvenlik testidir.
                    cy.get('button[type="submit"]').contains('Post Comment').click({ force: true });

                    // ==========================================
                    // DOĞRULAMALAR (Assertions)
                    // ==========================================

                    // A. Backend Doğrulaması: Sunucu boş veriyi reddetmeli ve zarifçe 422 dönmeli!
                    // Eğer 500 dönerse sunucu çökmüş, 200 dönerse veritabanına boş kayıt atmış demektir (ikisi de bug'dır).
                    cy.wait('@postEmptyComment').its('response.statusCode').should('eq', 422);

                    // B. UI (Arayüz) Doğrulaması:
                    // Ekrana yanlışlıkla boş bir yorum kartı çizilmediğinden emin olmalıyız.
                    // Makalede henüz hiç yorum olmadığı için .card-text sınıfı HİÇ bulunmamalıdır.
                    cy.get('.card-text').should('not.exist');
                });
            });
        });
    });

    it('Silinen yorumun "Hayalet (Ghost)" olarak tekrar gelip gelmediği (Cache Kontrolü)', () => {
        // 1. Giriş yapıyoruz
        cy.task('queryDb', 'SELECT email, password FROM users WHERE status="active"').then((users) => {
            const user = users[0];
            cy.apiLogin(user.email, user.password);

            const uniqueStamp = Date.now();
            const ghostCommentText = `Bu yorum silinecek ve asla geri gelmemeli. ID: ${uniqueStamp}`;

            cy.window().then((win) => {
                const token = win.localStorage.getItem('jwtToken');

                // 2. PRE-CONDITION: Makaleyi ve Yorumu API'den oluştur
                cy.request({
                    method: 'POST',
                    url: 'https://conduit-api.bondaracademy.com/api/articles',
                    headers: { Authorization: `Token ${token}` },
                    body: { article: { title: `Ghost Data Testi ${uniqueStamp}`, description: 'Cache', body: 'İçerik', tagList: [] } }
                }).then((articleRes) => {
                    const slug = articleRes.body.article.slug;

                    cy.request({
                        method: 'POST',
                        url: `https://conduit-api.bondaracademy.com/api/articles/${slug}/comments`,
                        headers: { Authorization: `Token ${token}` },
                        body: { comment: { body: ghostCommentText } }
                    }).then(() => {

                        // 3. UI Etkileşimi: Makaleye git ve yorumun orada olduğunu gör
                        cy.visit(`/article/${slug}`);
                        cy.contains('.card-text', ghostCommentText).should('be.visible');

                        // 4. SİLME İŞLEMİ
                        cy.intercept('DELETE', `**/api/articles/${slug}/comments/*`).as('deleteGhost');
                        cy.contains('.card', ghostCommentText).find('.ion-trash-a').click();
                        cy.wait('@deleteGhost').its('response.statusCode').should('eq', 200);

                        // Anında UI Kontrolü: Yorum arayüzden kayboldu mu?
                        cy.contains('.card-text', ghostCommentText).should('not.exist');

                        // ==========================================
                        // HAYALET VERİ (GHOST DATA) KONTROLÜ
                        // ==========================================

                        // 5. Sayfayı yenile (F5) ve backend'den en güncel yorum listesinin çekilmesini bekle
                        cy.intercept('GET', `**/api/articles/${slug}/comments`).as('getComments');

                        // cy.reload() tam bir SDET taktiğidir. SPA (Single Page Application) yapılarındaki
                        // anlık state yanılsamalarını yok eder, gerçeği sunucudan ister.
                        cy.reload();

                        cy.wait('@getComments').its('response.statusCode').should('eq', 200);

                        // 6. Nihai Doğrulama: Yorum sayfa yenilendikten sonra zombi gibi geri dönmemeli!
                        // Hem DOM'da gizlenmediğinden hem de veritabanından cidden silindiğinden emin oluyoruz.
                        cy.contains('.card-text', ghostCommentText).should('not.exist');
                    });
                });
            });
        });
    });

});