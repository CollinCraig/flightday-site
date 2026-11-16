# Label a wake light

validated on staging: pending

1. In staging HA, open Settings → Devices & services → Entities.
2. Open the demo Bedroom lamp (`light.bedroom_lamp`), then its entity settings.
3. In Labels choose Add new label. Name it `flightday_wake_lights` and confirm
   the generated label id is exactly `flightday_wake_lights`. Save it on the
   entity, rather than only on its device or area.
4. Open Flight Day's Rooms & devices editor and request suggestions again.
   An eligible light carrying that label receives +100 suggestion weight.
   Confirm the suggested wake-light role yourself; a label applies nothing
   silently. The wake_lights list includes eligible labelled entities.
5. Remove the entity label to undo the hint; edit any already-confirmed role
   separately. Changing a hint does not erase a person's saved choice.

screenshot to come (demo house)

No screenshots of real houses. UI labels can vary by HA version; confirm these
steps on staging. Labeling alone never turns the lamp on.

Service-data schema validation: N/A; no registration or service call.
