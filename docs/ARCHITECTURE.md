# Architecture

React, TypeScript et Vite ; client Supabase épinglé ; ExcelJS chargé uniquement lors d’un export Excel. Le service worker met en cache l’interface et ses ressources, jamais les requêtes Supabase Auth/API.

Le schéma contient `caisse_access`, `caisse_products`, `caisse_tables`, `caisse_clients`, `caisse_orders`, `caisse_order_lines`, `caisse_payments`, `caisse_operations` , `caisse_events` et `caisse_runtime`. Toutes les tables ont RLS. Les lectures métier sont accordées aux membres autorisés et, lorsque l’interrupteur serveur est actif, aux visiteurs sans compte. Les écritures directes sont révoquées.

Les RPC publiques sont des wrappers SECURITY INVOKER. Le code privilégié nécessaire aux transactions se trouve dans le schéma non exposé `caisse_private`, avec `search_path` vide, contrôle explicite `auth.uid()` et autorisation fraîche depuis l’adresse confirmée de `auth.users`. Aucune autorisation ne repose sur `user_metadata`.

`caisse_runtime.public_access` active intentionnellement la caisse publique. `caisse_public_access()` ne renvoie qu’un booléen. Un client Supabase distinct sans session ni persistance Auth traite les lectures, RPC et Realtime publiques ; une ancienne session privée mémorisée n’est jamais réutilisée pour ces opérations. Le serveur attribue au journal une identité technique sans identifiants de connexion. Les visiteurs peuvent administrer les produits et tables mais ne peuvent ni consulter ni modifier la liste des comptes, ni changer l’interrupteur serveur. Les protections transactionnelles sont identiques dans les deux modes.

Chaque navigateur conserve un UUID d’appareil et une file IndexedDB propre au mode public. Le chargement hors ligne reprend le dernier mode connu. Un changement vers la démo est refusé tant que des opérations attendent leur confirmation. L’identifiant d’appareil n’est qu’une indication d’origine non authentifiée.

Une mutation attend la validation de l’écriture IndexedDB. La RPC prend un verrou sur son identifiant, retourne la réponse déjà enregistrée en cas de réessai, puis verrouille la commande et vérifie sa version. Elle écrit la mutation, les paiements, le résultat idempotent et l’historique dans la même transaction. Le client retire l’opération locale seulement après une réponse serveur positive. Un identifiant existant avec un autre contenu est refusé.

Les événements Postgres Realtime déclenchent un rafraîchissement cohérent par une RPC de lecture MVCC. La reconnexion réseau, le retour au premier plan et un contrôle périodique reprennent la file. Les conflits restent conservés jusqu’à résolution explicite. Un brouillon rejeté peut être consulté avant abandon ; une opération dont le résultat est inconnu ne peut pas être abandonnée.

Le schéma initial préparait la connexion à Dipsy Tables avec `caisse_tables.external_table_id` et `caisse_orders.external_reservation_id`. La migration de passerelle ajoute quatre tables de source/journal et `caisse_reservation_cases`, des UUID et clés étrangères composites. [Le guide de passerelle](RESERVATION-BRIDGE.md) définit la source de vérité et l’activation après migration sur les appareils. Aucun droit n’est accordé sur l’ancien projet.

## Limites connues

- Pas de terminal bancaire intégré, remboursement, avoir, clôture de caisse fiscale ou impression de ticket en V1.
- Après un premier règlement, les articles sont verrouillés pour préserver les montants. Le solde peut toujours être payé.
- Les réglages de TVA sont explicites ; l’application ne décide pas du régime fiscal d’un produit. La ventilation des encaissements est un outil de rapprochement à valider avec la comptable.
- Le chargement initial utilise un instantané complet du restaurant. Prévoir pagination et agrégats serveur avant un historique volumineux.
- Une adresse désactivée est refusée immédiatement par la base. Les données déjà consultées hors ligne ne peuvent pas être retirées à distance d’un appareil déconnecté.
- La copie JSON de l’interface n’est pas une sauvegarde de reprise : elle exclut le journal `caisse_operations`. Une vraie sauvegarde doit conserver les dix tables et les identités Auth correspondantes.
- Les sauvegardes nocturnes ne deviennent actives qu’après configuration des secrets dédiés et de la variable d’activation.
