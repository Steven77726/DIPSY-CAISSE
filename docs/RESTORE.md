# Sauvegarde et restauration

## Périmètre

Une sauvegarde caisse cohérente doit inclure les **neuf** tables `public.caisse_*`, notamment `caisse_operations` (clés d’idempotence) et `caisse_events` (historique). Une copie de paiements sans leurs clés d’opération pourrait autoriser la duplication d’un ancien envoi après restauration.

`scripts/backup.sh` crée un dump PostgreSQL de données cohérent, limité aux tables de la caisse et chiffré avec une clé publique age. Les paramètres `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` et `AGE_RECIPIENT` viennent du gestionnaire de secrets. Utiliser PostgreSQL client 17 ou ultérieur compatible avec le serveur. Le dump ne modifie aucune table. La clé privée de déchiffrement se conserve hors de GitHub et hors de la caisse.

Le workflow `backup.yml` est fourni pour une exécution à 03:15 UTC chaque jour. Il est **désactivé par défaut** : renseigner les secrets `CAISSE_PGHOST`, `CAISSE_PGPORT`, `CAISSE_PGUSER`, `CAISSE_PGPASSWORD`, la variable publique `CAISSE_AGE_RECIPIENT`, puis `CAISSE_BACKUPS_ENABLED=true`. La sortie est un artefact chiffré conservé 30 jours. Tester un lancement manuel et son déchiffrement avant de considérer cette sauvegarde comme opérationnelle. Surveiller les échecs et conserver une copie indépendante du compte GitHub.

Les identités Auth sont partagées avec les autres applications et ne sont pas incluses dans le dump caisse. Il faut aussi activer/vérifier les sauvegardes complètes du projet et, si adapté au plan Supabase, la restauration à un instant donné. Aucun abonnement payant ou PITR n’est activé par ces scripts.

## Exercice testé automatiquement

`npm run test:database` crée deux bases PostgreSQL embarquées isolées. Il crée des identités Auth de test, installe le schéma, crée une commande, effectue un paiement partiel mixte et le solde, copie les neuf tables, puis restaure ces données sur la seconde base avec les mêmes identités. Il vérifie les lignes générées HT/TTC, les sommes, le nombre de lignes de chaque table et le réessai d’une ancienne opération : aucun paiement supplémentaire ne doit apparaître.

Ce test valide les invariants de restauration des données de la caisse, **pas** une restauration complète du service Supabase Auth ou un exercice réel de déchiffrement/pg_restore d’une sauvegarde de production. Ces deux exercices restent à réaliser après activation de la destination et des sauvegardes.

## Procédure de reprise

1. Suspendre les écritures et garder les appareils possédant une file d’opérations en attente. Noter l’heure de l’incident et le dernier commit déployé.
2. Choisir un point de sauvegarde et vérifier son empreinte. Déchiffrer dans un environnement administratif protégé.
3. Restaurer **d’abord sur un projet de test isolé**. Pour une perte complète du projet, restaurer la sauvegarde globale Supabase avec Auth avant la partie caisse. Pour un exercice limité à la caisse, préserver les UUID Auth référencés.
4. Appliquer le schéma de la version correspondante sur une base de test préparée, puis restaurer les neuf tables. Les colonnes générées des lignes sont recalculées ; restaurer aussi les séquences d’identité. Ne pas utiliser un TRUNCATE/CASCADE global sur le projet partagé.
5. Contrôler commandes, lignes, totaux TTC/HT/TVA, sommes CB/espèces, journaux et clés d’idempotence. Rejouer une ancienne opération de paiement : elle doit retourner son résultat sans nouvelle écriture. Vérifier RLS et les huit tables Realtime.
6. Documenter le résultat et le temps de reprise ; faire valider le rapprochement par le responsable. Procéder ensuite seulement à une restauration réelle ciblée et contrôlée.
7. Reconnecter les appareils un à un. Vérifier chaque opération inconnue avec **son identifiant d’origine** ; ne jamais remplacer les identifiants d’une file issue d’avant l’incident. Traiter explicitement les opérations qui étaient postérieures au point restauré.

Objectifs de reprise à définir après choix de la sauvegarde : le workflow quotidien seul donne un point de reprise pouvant dater de 24 heures. Ce n’est pas une garantie de perte nulle.
