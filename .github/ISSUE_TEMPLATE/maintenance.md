---
name: Maintenance planifiée
about: Annoncer une fenêtre de maintenance sur la page de statut
title: "Maintenance : "
labels: maintenance
assignees: ''
---

<!--
RAPPEL SLA (docs/deployment/MONITORING-EXTERNE.md, annexe 1 section 6) : cette
issue doit être publiée au moins 48 heures avant le début de la fenêtre
annoncée. Une maintenance publiée plus tard n'est plus conforme au préavis
contractuel, même si elle s'affiche correctement sur la page de statut.

Format exact attendu par Upptime (https://upptime.js.org/docs/scheduled-maintenance,
vérifié le 2026-09-16) : un commentaire HTML avec les clés start/end
(obligatoires, horodatage ISO 8601 avec décalage horaire) et expectedDown
(optionnel, liste de slugs séparés par des virgules, correspondant aux
`slug` déclarés dans .upptimerc.yml). Upptime ferme automatiquement cette
issue à l'heure de fin déclarée.

Remplacer les valeurs ci-dessous avant de publier l'issue. Ne pas modifier
les noms de clés ni la structure du bloc.
-->

<!--
start: AAAA-MM-JJTHH:MM:SS+HH:MM
end: AAAA-MM-JJTHH:MM:SS+HH:MM
expectedDown: slug-du-service-concerne
-->

## Services concernés

<!-- Noms commerciaux tels qu'affichés sur la page de statut, pas les slugs. -->

## Raison de la maintenance

## Fenêtre annoncée

- Début : AAAA-MM-JJ à HH:MM (heure de Paris)
- Fin prévue : AAAA-MM-JJ à HH:MM (heure de Paris)

## Après la maintenance

- [ ] Ajouter la ligne `MNT-...` au registre des incidents (`docs/deployment/incident-register.md`, dépôt privé), avec les heures réelles, le jour même.
- [ ] Vérifier que la fenêtre réelle reste dans la limite de 8 heures par mois civil (annexe 1 section 6) ; sinon, décompter l'excédent comme indisponibilité.
