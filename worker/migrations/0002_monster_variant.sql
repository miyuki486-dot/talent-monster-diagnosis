-- Apply once before deploying the Worker that stores gender/partner choices.
-- Existing diagnoses predate the choice screen, so they retain the female art
-- that the previous public version displayed.
ALTER TABLE diagnoses ADD COLUMN gender_choice TEXT;
ALTER TABLE diagnoses ADD COLUMN monster_variant TEXT;

UPDATE diagnoses
SET gender_choice = 'legacy', monster_variant = 'female'
WHERE gender_choice IS NULL OR monster_variant IS NULL;
