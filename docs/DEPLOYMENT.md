# Mise en service

## Hébergements

Le dépôt est `Steven77726/DIPSY-CAISSE`. Le workflow `.github/workflows/deploy.yml` effectue les contrôles avant de publier `main` sur GitHub Pages. Il n’applique jamais automatiquement une migration SQL à la base partagée.

Dans le dépôt, choisir **Settings → Pages → Build and deployment → Source → GitHub Actions**. Le déploiement utilise un jeton GitHub Actions temporaire et aucun secret de déploiement personnel. Le workflow calcule le chemin de base (notamment `/DIPSY-CAISSE/`) au lieu de supposer que l’application occupe la racine du domaine.

Une publication Sites privée est également possible avec `.openai/hosting.json`. Le site Sites et GitHub Pages ont des origines différentes : leurs sessions et files locales sont distinctes. Choisir une URL canonique pour le personnel ; ne pas utiliser alternativement les deux origines pendant un service.

## Supabase Auth

Le schéma `database/schema.sql` a été installé sur le projet partagé. Ne pas le rejouer : il s’agit de l’état initial versionné, pas d’un script idempotent. Les modifications futures nécessitent des migrations additives revues séparément.

L’adresse du premier administrateur a été autorisée séparément, sans la publier dans le dépôt. L’autorisation ne crée pas de mot de passe et ne marque jamais une adresse comme vérifiée à la place de son propriétaire.

1. Dans **Authentication → URL Configuration**, conserver la **Site URL** et les URL de Dipsy Tables. Ajouter l’URL complète de la caisse aux **Redirect URLs** (avec le chemin de base et le slash final). Les flux de la caisse transmettent explicitement cette URL de retour. Ajouter aussi `http://127.0.0.1:5173/` pour le développement si nécessaire.
2. Vérifier que l’authentification par e-mail et la confirmation d’adresse sont activées. Utiliser un SMTP de production pour les envois à l’équipe ; les limites du service e-mail par défaut ne conviennent pas à un envoi important.
3. Sur la caisse, ouvrir **Première connexion ?**, utiliser l’adresse autorisée et choisir un mot de passe de 12 caractères ou plus. Confirmer le lien reçu puis se connecter.
4. Ajouter les vrais produits avec le taux de TVA approprié et les vraies tables dans Paramètres.
5. Ajouter les adresses du personnel dans **Équipe & accès**. Chaque personne active ensuite son compte et confirme son e-mail. L’application n’envoie pas d’invitations lorsqu’une adresse est autorisée.
6. Faire un essai de service sur deux appareils connectés avec des utilisateurs autorisés avant la mise en exploitation.

Le navigateur contient une clé publishable publique, protégée par RLS et les fonctions transactionnelles. Ne jamais placer un secret, mot de passe ou `service_role` dans une variable `VITE_*` ou dans le dépôt.

## Sur l’iPad et l’iPhone

Ouvrir l’URL canonique dans Safari puis utiliser **Partager → Sur l’écran d’accueil**. La première connexion et le premier chargement doivent se faire avec Internet. Le stockage local peut être effacé par le système : ne pas vider les données Safari ni changer d’origine avec des opérations en attente. Un règlement non confirmé se vérifie dans la synchronisation ; ne pas en créer un nouveau.

## Retour à une version précédente

Réutiliser un commit précédemment validé, le faire repasser par les contrôles et publier. Ne jamais restaurer automatiquement un schéma partagé pour revenir à une ancienne version de l’interface. Conserver la compatibilité des RPC et des versions de données.
