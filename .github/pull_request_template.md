## Summary

Describe what changed and why.

## Type

- [ ] Scanner rule or parser change
- [ ] Web demo change
- [ ] CLI/reporting change
- [ ] Fixture or test change
- [ ] Documentation change
- [ ] Maintenance

## Validation

- [ ] `npm test`
- [ ] Relevant fixture scan, if applicable:

```bash
npm run scan -- examples/risky-skill --fail-on none
```

## Security Notes

- [ ] This PR does not execute untrusted skill code.
- [ ] This PR does not add real secrets, credentials, private keys, tokens, or proprietary code.
- [ ] New findings use stable `ruleId` values and are documented in `docs/RULES.md`.

## Screenshots

Add screenshots for web demo or report changes.
