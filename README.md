# Examina — Tests QCM chronométrés

React 18 + TypeScript (strict) + Supabase (Postgres, Auth, RLS).

- **Admin** : crée les candidats et imprime leurs **badges QR**, crée des tests avec des questions à **4 choix dont 1 à 3 vrais**, règle la durée, **affecte** le test à des candidats, le **lance** / le **clôture**, consulte les résultats.
- **Candidat** : se connecte en **scannant son QR code**, clique sur « Commencer » (le **chronomètre HH:MM:SS** démarre à ce moment), sauvegarde automatique, soumission automatique à 00:00:00, voit son résultat et la correction.

---

## Démarrage

```bash
npm install
cp .env.example .env          # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, (VITE_PUBLIC_APP_URL)
```

1. **Base de données** : exécuter les deux fichiers de `supabase/migrations/` **dans l'ordre**
   (SQL Editor, ou `supabase db push`).
2. **Edge Functions** (CLI Supabase) :
   ```bash
   supabase functions deploy qr-login --no-verify-jwt   # appelée par un candidat pas encore connecté
   supabase functions deploy admin-candidates
   # facultatif : domaine des emails techniques des candidats (aucun mail n'est envoyé)
   supabase secrets set CANDIDATE_EMAIL_DOMAIN=candidats.votre-domaine.com
   ```
3. **Compte administrateur** : Supabase → *Authentication → Users → Add user* (email + mot de passe), puis :
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'vous@exemple.com');
   ```
4. `npm run dev` → se connecter via « Espace administrateur ».

> `VITE_PUBLIC_APP_URL` est l'adresse encodée dans les QR. En production, mettez l'URL publique
> (ex. `https://examina.votre-domaine.com`) ; sinon, c'est l'URL du navigateur de l'admin qui est utilisée.

| Commande            | Rôle                                  |
| ------------------- | ------------------------------------- |
| `npm run dev`       | serveur de développement              |
| `npm run build`     | vérification des types + build de prod |
| `npm test`          | tests unitaires (domaine + application) |
| `npm run typecheck` | vérification TypeScript seule          |

---

## Déroulé complet

```
ADMIN                                              CANDIDAT
─────                                              ────────
1. Candidats → « Ajouter » → badge QR imprimé  ──▶ reçoit son badge
2. Crée un test, ajoute les questions/choix
3. Affecte des candidats au test
4. « ▶ Lancer le test »                        ──▶ 5. Scanne le QR avec son téléphone → connecté
                                                   6. Voit le test dans « Mes tests »
                                                   7. Clique « Commencer » → LE CHRONO DÉMARRE
                                                   8. Répond (auto-save) → soumet, ou 00:00:00 = soumission auto
9. Résultats : tableau des scores + détail     ◀── 10. Voit son score et la correction
```

**Lancer ≠ démarrer le chronomètre.** « Lancer » rend le test disponible aux candidats affectés.
Le chronomètre de chaque candidat démarre au moment où **il** clique sur « Commencer »
(`start_attempt` fixe `expires_at = now() + durée`). « Clôturer » empêche tout nouveau départ ;
les tentatives déjà commencées continuent jusqu'à leur échéance.

## Connexion par QR code — comment ça marche

```
Badge imprimé                Téléphone du candidat             Supabase
─────────────                ─────────────────────             ────────
QR = https://app/qr#t=JETON
           │ scan (appareil photo)
           ▼
                         /qr lit le JETON dans le #,
                         l'efface de l'URL
                         POST qr-login { token } ──────────▶ Edge Function qr-login :
                                                              · sha256(JETON) existe, non révoqué ?
                                                              · candidat actif ?
                                                              · generateLink(magiclink) SANS email
                         ◀──────────────── { tokenHash } ────
                         auth.verifyOtp(tokenHash) ────────▶ session Supabase normale (JWT)
                         → « Mes tests »
```

- **Jeton** : 256 bits aléatoires (impossible à deviner). La base ne stocke que son **hash SHA-256** :
  une fuite de la base ne permet pas de se connecter.
- **Fragment `#`** : le jeton n'est jamais envoyé au serveur web, n'apparaît ni dans les logs ni dans le Referer.
- **Un seul QR valide par candidat** (index unique). « Nouveau QR » invalide immédiatement l'ancien
  (badge perdu ou photographié).
- **Désactiver** un candidat révoque son QR (trigger) et ferme ses sessions.
- Les candidats n'ont ni email réel ni mot de passe : leur compte Supabase utilise un email technique
  `uuid@CANDIDATE_EMAIL_DOMAIN` qui ne reçoit jamais de courrier.
- La clé `service_role` ne vit **que** dans les Edge Functions, jamais dans le navigateur.
- Les QR ne sont affichables qu'au moment de leur génération : l'admin les imprime alors
  (bouton « Imprimer », mise en page 3 badges par ligne).

Le QR est un facteur unique (« ce que je possède »). Pour un examen à fort enjeu, on peut ajouter un
code PIN court vérifié dans `qr-login` en second facteur.

## Architecture (Clean / Hexagonale)

```
src/
├── domain/            ← Métier pur : aucune dépendance à React ni à Supabase
│   ├── quiz/          Quiz, Question, règles (4 choix, 1–3 vrais), politique de publication
│   ├── scoring/       Stratégies de notation (tout-ou-rien, crédit partiel)
│   ├── timer/         Duration (HH:MM:SS), Clock, Countdown
│   ├── attempt/       AnswerSheet (feuille de réponses immuable), types de session/résultat
│   ├── candidate/     Candidate, règles de saisie, format du lien QR
│   └── shared/        DomainError, Validator / Rule
├── application/       ← Cas d'utilisation
│   ├── ports/         Interfaces : QuizRepository, QuestionRepository, AttemptGateway, AuthGateway
│   └── services/      QuizAdminService, QuizSessionService, CandidateAdminService, AnswerSyncQueue
├── infrastructure/    ← Adaptateurs Supabase (implémentent les ports)
│   ├── supabase/      client, mappers (snake_case → domaine), traduction des erreurs
│   └── repositories/  SupabaseQuizRepository, SupabaseQuestionRepository, SupabaseAttemptGateway…
├── presentation/      ← React
    ├── di/            Composition Root (seul endroit qui instancie Supabase)
    ├── hooks/         useCountdown, useQuizSession (machine à états), useAsync
    ├── components/    Timer, QuestionForm, QuestionView, …
    └── pages/         admin/ (tests, candidats, résultats), candidate/, QrLoginPage
supabase/
├── migrations/        schéma, règles, RLS, RPC
└── functions/         qr-login, admin-candidates (Deno, clé service_role)
```

**Règle de dépendance** : `presentation → application → domain` et `infrastructure → application → domain`.
Le domaine ne dépend de rien ; remplacer Supabase revient à écrire de nouveaux adaptateurs pour les ports.

### Design patterns utilisés

| Pattern | Où | Pourquoi |
| --- | --- | --- |
| **Repository / Gateway (Ports & Adapters)** | `application/ports`, `infrastructure/repositories` | Métier indépendant de la base |
| **Specification / Rule** | `domain/shared/Validation.ts`, `questionValidator` | Chaque règle métier est un objet isolé et testable |
| **Factory** | `QuestionDraftFactory`, `QuizDraftFactory`, `ScoringStrategyFactory` | Création et mutations immuables centralisées |
| **Strategy** | `AllOrNothingStrategy`, `PartialCreditStrategy` | Mode de notation interchangeable par test |
| **Observer** | `Countdown.subscribe / onExpire`, `AnswerSyncQueue.onStatusChange` | Le chronomètre notifie l'UI sans la connaître |
| **Value Object** | `Duration` | Formatage HH:MM:SS, arrondi, comparaison |
| **Command + file d'attente** | `AnswerSyncQueue` | Auto-save fusionné, séquentiel, avec reprise sur erreur réseau |
| **State Machine (reducer)** | `useQuizSession` | `loading → active → submitting → closed` sans états incohérents |
| **Data Mapper** | `infrastructure/supabase/mappers.ts` | Isoler le format SQL du domaine |
| **Anti-Corruption Layer** | `toDomainError` | Erreurs Postgres → `DomainError` typées |
| **Dependency Injection / Composition Root** | `presentation/di/container.tsx` | Services injectés via Context ; faciles à remplacer en test |

---

## Règles métier et où elles sont garanties

| Règle | Client (UX) | Serveur (autorité) |
| --- | --- | --- |
| Exactement 4 choix | `questionValidator` | RPC `save_question` + trigger contraint **différé** |
| 1 à 3 bonnes réponses (au moins une fausse) | toggle bloqué à 3 + validateur | même trigger : impossible même en SQL direct |
| Le candidat ne voit pas les bonnes réponses | — | RLS : `choices` réservé à l'admin ; `get_attempt_session` n'envoie jamais `is_correct` |
| Chronomètre | `Countdown` calé sur l'heure serveur | `expires_at` fixé par `start_attempt` ; `save_answer` refuse après expiration (+5 s de tolérance) |
| Fermer l'onglet n'arrête pas le temps | reprise automatique | tentatives expirées finalisées et notées par le serveur |
| Max 3 cases cochées par question | `AnswerSheet.toggle` | `save_answer` → `TOO_MANY_CHOICES` |
| Nombre de tentatives | bouton masqué | `start_attempt` → `MAX_ATTEMPTS_REACHED` |
| Pas de publication d'un test vide | `QuizPublicationPolicy` | trigger `QUIZ_EMPTY` |
| Lancer exige au moins un candidat affecté | `QuizPublicationPolicy.assertCanLaunch` | — |
| Seuls les candidats affectés voient / démarrent le test | — | `list_available_quizzes`, `start_attempt` → `NOT_ASSIGNED` |
| Candidat désactivé | — | `start_attempt` → `CANDIDATE_INACTIVE`, QR révoqué par trigger |
| Connexion QR | `QrLoginLink.parse` (format) | Edge Function `qr-login` (hash, révocation, statut) |
| Calcul de la note | détail par question (affichage) | `internal.compute_score` (fait foi) |

### Le chronomètre

- Le serveur fixe `expires_at = now() + durée` au démarrage.
- À l'ouverture, le client mesure le décalage entre son horloge et celle du serveur en compensant la latence (`ServerSyncedClock.fromRoundTrip`). Si l'horloge du PC est fausse, le compte à rebours reste juste.
- `Countdown` recalcule `échéance − maintenant` à chaque tick (250 ms) : aucune dérive, même si l'onglet est mis en veille. Il ne notifie qu'au changement de seconde, et seul le composant `Timer` (mémoïsé) est re-rendu.
- Couleur : normale, **orange** sous 20 % du temps restant, **rouge clignotant** sous 1 minute. Annonces vocales à 5 min, 1 min et 10 s (accessibilité).
- À 00:00:00, la file d'auto-save est vidée puis le test est soumis automatiquement.

### Notation

- **Tout ou rien** : points acquis si la sélection est exactement l'ensemble des bonnes réponses.
- **Crédit partiel** : `points × max(0, (bonnes cochées − mauvaises cochées) / nb bonnes réponses)`.

---

## Tests

- `src/domain/domain.test.ts` : règles de question, stratégies, `Duration`, `Countdown` (horloge et planificateur simulés), `AnswerSheet`.
- `src/application/services/application.test.ts` : `AnswerSyncQueue` (fusion, reprise réseau, erreurs métier), `QuizAdminService` avec dépôts factices.

Pour aller plus loin : générer les types Supabase (`supabase gen types typescript`) et ajouter des tests d'interface (Testing Library) en injectant des `Services` factices dans `<App services={…} />`.
