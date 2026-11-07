# Exemple : test « Mathématiques — niveau simple »

Décompressez ce dossier **à la racine du projet `qcm-app`** (les chemins se superposent) :

```
public/exemples/maths/*.svg              ← 8 graphes (servis par l'app : /exemples/maths/...)
supabase/seed/exemple_test_maths.sql     ← crée le test + 10 questions
scripts/generer_graphes_maths.py         ← régénère les graphes (python3 + matplotlib)
```

## Installation
1. Copier les fichiers, puis `git add public supabase/seed scripts` et pousser (Vercel publiera les images).
2. Supabase → **SQL Editor** → coller et exécuter `supabase/seed/exemple_test_maths.sql`.
3. Dans l'app (admin) : ouvrir le test → cocher les candidats → **▶ Lancer le test**.
   (Ou décommenter les 2 requêtes à la fin du script pour l'affecter à tous et le lancer.)

Le script est ré-exécutable : il recrée le test à l'identique (⚠ supprime les tentatives de CE test).

## Contenu — 20 min, crédit partiel, 14 points
| # | Image | Sujet | Bonnes réponses |
|---|---|---|---|
| 1 | droite | équation de y = 2x + 1 | 1 |
| 2 | parabole | racines, minimum, f(0) | 3 |
| 3 | barres | maximum, moyenne, total (piège : médiane) | 3 |
| 4 | camembert | 25 % de 40 élèves | 1 |
| 5 | triangle 3-4-5 | Pythagore, aire, périmètre | 3 |
| 6 | repère | lecture de coordonnées | 2 |
| 7 | droite décroissante | sens de variation, f(4) | 2 |
| 8 | rectangle | aire 6 × 2,5 | 1 |
| 9 | — | 3/4 + 1/8 (fraction et décimal) | 2 |
| 10 | — | nombres premiers | 2 |

Pour remplacer une image depuis l'interface admin : « Modifier » → « Supprimer l'image » → téléverser
la nouvelle (elle ira alors dans Supabase Storage, comme vos autres images).
