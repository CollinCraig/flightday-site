"""YAML-only example; its sensor platform owns the entity lifecycle."""
from homeassistant.helpers import config_validation as cv, discovery

DOMAIN = "flightday_example"
CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

async def async_setup(hass, config):
    """Load the sensor without a config entry or config flow."""
    await discovery.async_load_platform(hass, "sensor", DOMAIN, {}, config)
    return True
