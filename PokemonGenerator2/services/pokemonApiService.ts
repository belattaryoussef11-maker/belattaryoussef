// services/pokemonApiService.ts

import { Pokemon, PokemonStatus, PokemonRarity, ApiErrorResponse } from '../types';

const API_BASE_URL = 'https://epsi.journeesdecouverte.fr:22222/v1'; // Changed to HTTPS
const AUTH_TOKEN = 'EPSI'; // Statically defined Bearer token as per docs/03-authentication.md
const REQUEST_TIMEOUT = 30000; // 30 seconds timeout for the API request

/**
 * Service for interacting with the external Pokémon generation API.
 */
export class PokemonApiService {

  // A list of common Pokémon types for client-side mocking
  private static readonly POKEMON_TYPES = [
    'Normal', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Fighting', 'Poison',
    'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Steel',
    'Dark', 'Fairy'
  ];

  // A list of generic Pokémon attack names for client-side mocking
  private static readonly POKEMON_ATTACKS = [
    'Tackle', 'Scratch', 'Ember', 'Water Gun', 'Vine Whip', 'Thunder Shock',
    'Quick Attack', 'Bite', 'Growl', 'Tail Whip', 'Sand Attack', 'Confusion'
  ];

  /**
   * Generates a new Pokémon by calling the external API.
   * Handles authentication, timeouts, and error responses.
   * @returns A promise that resolves with the generated Pokemon object.
   * @throws {Error} if the API call fails or returns an error.
   */
  public async generatePokemon(): Promise<Pokemon> {
    const url = `${API_BASE_URL}/generate`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
        },
        // Explicitly setting mode to 'cors' although it's the default for cross-origin requests.
        // This makes it clear that we expect CORS behavior.
        mode: 'cors',
        signal: controller.signal, // Add AbortController signal for timeout
      });

      clearTimeout(timeoutId); // Clear the timeout as the request completed

      if (!res.ok) {
        const errorData: ApiErrorResponse = await res.json().catch(() => ({
          error: {
            code: 'UNKNOWN_ERROR',
            message: `HTTP error! Status: ${res.status}`,
            timestamp: new Date().toISOString()
          }
        }));
        console.error('API Error Response:', errorData); // Clarified console log
        throw new Error(errorData?.error?.message || `Failed to generate Pokémon (HTTP ${res.status})`);
      }

      const data = await res.json();

      // For demonstration, assign a random type, attack, attackName, and PV as the external API doesn't provide it yet.
      // This allows the UI to display these stats as requested by the user.
      const randomType = PokemonApiService.POKEMON_TYPES[Math.floor(Math.random() * PokemonApiService.POKEMON_TYPES.length)];
      data.metadata.type = randomType; // Mocking the type field

      const randomAttack = Math.floor(Math.random() * (100 - 10 + 1)) + 10; // Attack between 10 and 100
      data.metadata.attack = randomAttack; // Mocking the attack field

      const randomAttackName = PokemonApiService.POKEMON_ATTACKS[Math.floor(Math.random() * PokemonApiService.POKEMON_ATTACKS.length)];
      data.metadata.attackName = randomAttackName; // Mocking the attackName field

      const randomPv = Math.floor(Math.random() * (200 - 50 + 1)) + 50; // PV between 50 and 200
      data.metadata.pv = randomPv; // Mocking the PV field

      // Validate and transform API response to match internal Pokemon interface
      if (!data || !data.imageBase64 || !data.metadata || !data.metadata.id || !data.metadata.name || !data.metadata.rarity || !data.metadata.type || !data.metadata.attack || !data.metadata.attackName || !data.metadata.pv || !data.generatedAt) {
        throw new Error('Invalid API response format received: missing expected fields (id, name, rarity, type, attack, attackName, pv, imageBase64, generatedAt).'); // More specific validation error
      }

      const pokemon: Pokemon = {
        id: data.metadata.id,
        name: data.metadata.name,
        rarity: data.metadata.rarity as PokemonRarity, // Cast to PokemonRarity enum
        type: data.metadata.type, // Assign the mocked type
        attack: data.metadata.attack, // Assign the mocked attack
        attackName: data.metadata.attackName, // Assign the mocked attack name
        pv: data.metadata.pv, // Assign the mocked PV
        imageBase64: data.imageBase64,
        generatedAt: data.generatedAt,
        status: PokemonStatus.OWNED, // New Pokémon are always owned initially
      };

      return pokemon;

    } catch (error) {
      clearTimeout(timeoutId); // Ensure timeout is cleared on any error
      console.error('Network or API processing error:', error); // Log the raw error object for more detail
      
      if ((error as Error).name === 'AbortError') {
        throw new Error(`The Pokémon generation request timed out after ${REQUEST_TIMEOUT / 1000} seconds. The API might be busy, please try again later.`);
      }

      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error(
          'Could not connect to the Pokémon API. This might be a network issue, the API server being down, or a self-signed HTTPS certificate. If the API uses a self-signed certificate, please try opening ' +
          API_BASE_URL + '/generate' + 
          ' in a new browser tab and accepting the security warning, then refresh this page. Also, verify the API server has correct CORS configuration for your client application\'s origin.'
        );
      }
      throw error; // Re-throw other errors
    }
  }
}

export const pokemonApiService = new PokemonApiService();