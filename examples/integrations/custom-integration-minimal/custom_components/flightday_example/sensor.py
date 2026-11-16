"""Measure the automation count when Flight Day reports ready."""
from datetime import timedelta
from asyncio import Lock
from homeassistant.config_entries import ConfigEntryState
from homeassistant.exceptions import ServiceValidationError
from homeassistant.components.sensor import SensorEntity
from homeassistant.util import dt as dt_util

async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities([AutomationCount()])

class AutomationCount(SensorEntity):
    _attr_name = "Flight Day example automation count"
    _attr_unique_id = "flightday_example_automation_count"
    _attr_should_poll = False

    async def async_added_to_hass(self):
        await super().async_added_to_hass()
        self._ready_lock = Lock()
        self._checked_at = dt_util.now()
        self._initial_published = False
        # Subscribe first: late setup may have missed the one-time ready event.
        self.async_on_remove(self.hass.bus.async_listen("flightday", self._maybe_ready))
        if any(e.state is ConfigEntryState.LOADED
               for e in self.hass.config_entries.async_entries("flightday")):
            await self._on_ready(initial=True)

    async def _maybe_ready(self, event):
        if event.data.get("action") == "ready":
            await self._on_ready(event=event)

    async def _on_ready(self, initial=False, event=None):
        async with self._ready_lock:
            # A queued ready from before the loaded check describes the same load.
            if event and self._initial_published and event.time_fired <= self._checked_at:
                return
            try:
                await self._publish()
            except ServiceValidationError as err:
                if str(err) != "not_ready":
                    raise
                return  # A reload raced us; wait for its next ready, without polling.
            if initial:
                self._initial_published = True

    async def _publish(self):
        hass = self.hass
        self._attr_native_value = len(hass.states.async_entity_ids("automation"))
        self.async_write_ha_state()
        await hass.services.async_call("flightday", "register_integration", {
            "id": "example_sensor", "name": "Automation count", "provides": ["lines"]
        }, blocking=True)
        await hass.services.async_call("flightday", "post_line", {
            "source": "x_example_sensor", "key": "automation_count",
            "text": f"{self.native_value} automations at Flight Day ready",
            "show": ["home"], "priority": "normal",
            "until": (dt_util.now() + timedelta(hours=24)).isoformat()
        }, blocking=True)
