// App.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { indexedDbService } from './services/indexedDbService';
import { pokemonApiService } from './services/pokemonApiService';
import { Pokemon, TokenBalance, AppMessage, PokemonStatus, PokemonRarity } from './types';
import Button from './components/Button';
import Modal from './components/Modal';
import { PlusCircle, Coins, Sparkles, RefreshCw, XCircle, Gem, Loader2, Sword, Heart } from 'lucide-react'; // Added Sword and Heart icons

const GENERATION_COST = 10;

// Define resell values based on rarity
const POKEMON_RESELL_VALUES: Record<PokemonRarity, number> = {
  [PokemonRarity.F]: 2,
  [PokemonRarity.E]: 3,
  [PokemonRarity.D]: 5, // Matches the old default RESELL_REFUND
  [PokemonRarity.C]: 8,
  [PokemonRarity.B]: 12,
  [PokemonRarity.A]: 18,
  [PokemonRarity.S]: 25,
  [PokemonRarity.S_PLUS]: 40,
};

// Map rarity enum to a numeric value for sorting
const RARITY_VALUES: Record<PokemonRarity, number> = {
  [PokemonRarity.F]: 0,
  [PokemonRarity.E]: 1,
  [PokemonRarity.D]: 2,
  [PokemonRarity.C]: 3,
  [PokemonRarity.B]: 4,
  [PokemonRarity.A]: 5,
  [PokemonRarity.S]: 6,
  [PokemonRarity.S_PLUS]: 7,
};

// Scoring constants for Pokedex
const OWNED_POKEMON_SCORE = 10;
const RESOLD_POKEMON_SCORE = 2;

type SortOrder = 'newestFirst' | 'rarityAsc' | 'rarityDesc';

const App: React.FC = () => {
  const [pokemons, setPokemons] = useState<Pokemon[]>([]);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGeneratingPokemon, setIsGeneratingPokemon] = useState<boolean>(false);
  const [message, setMessage] = useState<AppMessage | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('newestFirst'); // Default sort order

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>('');
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalOnConfirm, setModalOnConfirm] = useState<(() => void) | undefined>(undefined);
  const [isModalConfirmLoading, setIsModalConfirmLoading] = useState<boolean>(false);
  const [pokemonToResellId, setPokemonToResellId] = useState<string | null>(null);

  // Function to sort pokemons based on the current sort order
  const sortPokemons = useCallback((pokemonsArray: Pokemon[], currentSortOrder: SortOrder): Pokemon[] => {
    return [...pokemonsArray].sort((a, b) => {
      if (currentSortOrder === 'newestFirst') {
        return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
      } else if (currentSortOrder === 'rarityAsc') {
        return RARITY_VALUES[a.rarity] - RARITY_VALUES[b.rarity];
      } else if (currentSortOrder === 'rarityDesc') {
        return RARITY_VALUES[b.rarity] - RARITY_VALUES[a.rarity];
      }
      return 0; // Should not happen
    });
  }, []);

  // Moved showMessage definition before fetchAppData as fetchAppData depends on it
  const showMessage = useCallback((type: 'success' | 'error' | 'warning', text: string) => {
    setMessage({ type, text });
    const timer = setTimeout(() => {
      setMessage(null);
    }, 5000); // Message disappears after 5 seconds
    return () => clearTimeout(timer);
  }, []);

  const fetchAppData = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetchedPokemons = await indexedDbService.getPokemons();
      setPokemons(sortPokemons(fetchedPokemons, sortOrder)); // Apply initial sort
      
      const balance = await indexedDbService.getTokenBalance();
      setTokenBalance(balance.amount);
      setMessage(null);
    } catch (error) {
      console.error("Failed to fetch app data:", error);
      showMessage('error', 'Failed to load app data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [sortOrder, showMessage, sortPokemons]);

  useEffect(() => {
    fetchAppData();
  }, [fetchAppData]);

  // Re-sort pokemons when sortOrder changes
  useEffect(() => {
    setPokemons((prevPokemons) => sortPokemons(prevPokemons, sortOrder));
  }, [sortOrder, sortPokemons]);

  // Calculate Pokedex score
  const pokedexScore = useMemo(() => {
    let score = 0;
    pokemons.forEach(pokemon => {
      if (pokemon.status === PokemonStatus.OWNED) {
        score += OWNED_POKEMON_SCORE;
      } else if (pokemon.status === PokemonStatus.RESOLD) {
        score += RESOLD_POKEMON_SCORE;
      }
    });
    return score;
  }, [pokemons]);

  const handleGeneratePokemon = async () => {
    if (tokenBalance < GENERATION_COST) {
      showMessage('warning', `You need ${GENERATION_COST} tokens to generate a Pokémon. Current balance: ${tokenBalance}.`);
      return;
    }

    setIsGeneratingPokemon(true);
    let originalTokenBalance = tokenBalance; // Store original balance for rollback
    
    try {
      // Deduct tokens immediately
      const newBalanceAfterDeduction = originalTokenBalance - GENERATION_COST;
      setTokenBalance(newBalanceAfterDeduction);
      await indexedDbService.updateTokenBalance(newBalanceAfterDeduction);
      
      const newPokemon = await pokemonApiService.generatePokemon();
      await indexedDbService.addPokemon(newPokemon);
      setPokemons((prevPokemons) => sortPokemons([newPokemon, ...prevPokemons], sortOrder)); // Sort new collection
      showMessage('success', `Awesome! You generated a new Pokémon: ${newPokemon.name} (${newPokemon.rarity}, ${newPokemon.type})!`);
      
    } catch (error) {
      console.error("Error generating Pokémon:", error);
      // Rollback token deduction on failure
      const revertedBalance = originalTokenBalance;
      setTokenBalance(revertedBalance);
      await indexedDbService.updateTokenBalance(revertedBalance);
      showMessage('error', `Failed to generate Pokémon: ${error instanceof Error ? error.message : String(error)}. Tokens refunded.`);
    } finally {
      setIsGeneratingPokemon(false);
    }
  };

  const handleResellConfirmation = (pokemonId: string, pokemonName: string, pokemonRarity: PokemonRarity) => {
    setPokemonToResellId(pokemonId);
    setModalTitle('Resell Pokémon');

    const resellPrice = POKEMON_RESELL_VALUES[pokemonRarity];

    setModalContent(
      <p className="text-gray-700">
        Are you sure you want to resell <span className="font-semibold text-indigo-700">{pokemonName}</span>?
        You will receive <span className="font-bold text-green-600">{resellPrice} tokens</span> back. This action cannot be undone.
      </p>
    );
    setModalOnConfirm(() => async () => {
      // This is the core of the fix. The async function now closes over the `pokemonId`
      // argument from the `handleResellConfirmation` scope, which is guaranteed to be correct.
      // It no longer depends on the `pokemonToResellId` state variable, which was stale
      // when this handler was created.
      setIsModalConfirmLoading(true);
      try {
        const pokemonToResell = pokemons.find(p => p.id === pokemonId);
        if (pokemonToResell) {
          const updatedPokemon = { ...pokemonToResell, status: PokemonStatus.RESOLD };
          await indexedDbService.updatePokemon(updatedPokemon);
          
          const newBalance = tokenBalance + resellPrice; // Use dynamic resellPrice
          await indexedDbService.updateTokenBalance(newBalance);

          // Update state after DB operations are successful
          setPokemons((prevPokemons) =>
            sortPokemons(prevPokemons.map((p) => (p.id === updatedPokemon.id ? updatedPokemon : p)), sortOrder)
          );
          setTokenBalance(newBalance);
          
          showMessage('success', `${pokemonToResell.name} resold successfully! You gained ${resellPrice} tokens.`); // Use dynamic resellPrice
        }
      } catch (error) {
        console.error("Error reselling Pokémon:", error);
        showMessage('error', `Failed to resell Pokémon: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsModalConfirmLoading(false);
        closeModal();
      }
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setPokemonToResellId(null);
    setModalTitle('');
    setModalContent(null);
    setModalOnConfirm(undefined);
    setIsModalConfirmLoading(false);
  };

  // Memoized rarity colors for consistent styling
  const getRarityColor = useCallback((rarity: PokemonRarity) => {
    switch (rarity) {
      case PokemonRarity.F: return 'bg-gray-200 text-gray-800';
      case PokemonRarity.E: return 'bg-gray-300 text-gray-900';
      case PokemonRarity.D: return 'bg-blue-100 text-blue-800';
      case PokemonRarity.C: return 'bg-green-100 text-green-800';
      case PokemonRarity.B: return 'bg-purple-100 text-purple-800';
      case PokemonRarity.A: return 'bg-yellow-100 text-yellow-800';
      case PokemonRarity.S: return 'bg-orange-100 text-orange-800';
      case PokemonRarity.S_PLUS: return 'bg-red-100 text-red-800 font-bold';
      default: return 'bg-gray-100 text-gray-700';
    }
  }, []);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-4xl sm:text-5xl font-extrabold text-center mb-10 text-indigo-800 drop-shadow-md">
        Pokémon Generator Lab
      </h1>

      {message && (
        <div
          className={`p-4 mb-6 rounded-lg shadow-md flex items-center justify-between transition-opacity duration-300 ${
            message.type === 'success' ? 'bg-green-100 text-green-800' :
            message.type === 'error' ? 'bg-red-100 text-red-800' :
            'bg-yellow-100 text-yellow-800'
          }`}
          role="alert"
        >
          <p className="font-medium">{message.text}</p>
          <Button variant="ghost" size="sm" onClick={() => setMessage(null)}>
            <XCircle className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Token Balance */}
      <div className="bg-yellow-50 p-4 sm:p-6 rounded-xl shadow-md mb-4 flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold text-yellow-800 flex items-center gap-3">
          <Gem className="h-7 w-7 text-yellow-600" />
          Your Tokens:
        </h2>
        <span className="text-3xl sm:text-4xl font-extrabold text-yellow-900 leading-none">
          {tokenBalance}
        </span>
      </div>

      {/* Pokedex Score */}
      <div className="bg-blue-50 p-4 sm:p-6 rounded-xl shadow-md mb-8 flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold text-blue-800 flex items-center gap-3">
          <PlusCircle className="h-7 w-7 text-blue-600" />
          Pokedex Score:
        </h2>
        <span className="text-3xl sm:text-4xl font-extrabold text-blue-900 leading-none">
          {pokedexScore}
        </span>
      </div>

      {/* Generate Pokémon Section */}
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg mb-10 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-gray-900">
          Generate New Pokémon
        </h2>
        <p className="text-gray-600 mb-6">
          Unleash the power of AI to create a unique Pokémon!
          (Cost: <span className="font-semibold text-red-600">{GENERATION_COST} Tokens</span>)
        </p>
        <Button
          onClick={handleGeneratePokemon}
          variant="primary"
          size="lg"
          className="w-full sm:w-auto flex items-center justify-center gap-2"
          disabled={isGeneratingPokemon || isLoading || tokenBalance < GENERATION_COST}
        >
          {isGeneratingPokemon ? (
            <span className="flex items-center">
              <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
              Generating...
            </span>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              Generate Pokémon
            </>
          )}
        </Button>
      </div>

      {/* Pokémon Collection */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Your Collection</h2>
        <div className="flex items-center gap-2">
          <label htmlFor="sort-select" className="text-gray-700 text-base font-medium">Sort by:</label>
          <select
            id="sort-select"
            className="border border-gray-300 text-gray-700 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-transparent"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          >
            <option value="newestFirst">Newest First</option>
            <option value="rarityAsc">Rarity: F to S+</option>
            <option value="rarityDesc">Rarity: S+ to F</option>
          </select>
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="animate-spin h-10 w-10 text-indigo-600" />
          <p className="ml-4 text-lg text-gray-600">Loading your Pokémon...</p>
        </div>
      ) : pokemons.length === 0 ? (
        <p className="text-center text-gray-500 text-xl py-12 bg-white rounded-xl shadow-md">
          You haven't generated any Pokémon yet. Start creating above!
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pokemons.map((pokemon) => (
            <div key={pokemon.id} className="bg-white p-6 rounded-xl shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-200 flex flex-col">
              <div className="flex-grow">
                <div className="relative w-full h-48 mb-4 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                  <img
                    src={`data:image/png;base64,${pokemon.imageBase64}`}
                    alt={pokemon.name}
                    className="object-contain w-full h-full"
                    loading="lazy"
                  />
                  {pokemon.status === PokemonStatus.RESOLD && (
                    <div className="absolute inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center text-white text-lg font-bold">
                      RESOLD
                    </div>
                  )}
                </div>
                <h3 className="text-xl font-semibold mb-2 text-gray-900 flex items-center justify-between">
                  <span>{pokemon.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${getRarityColor(pokemon.rarity)}`}>
                      {pokemon.rarity}
                    </span>
                    {pokemon.type && ( // Display type if available
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-700 text-white">
                        {pokemon.type}
                      </span>
                    )}
                  </div>
                </h3>
                {/* New section for Attack and PV */}
                <div className="flex justify-around items-center text-sm mt-3 pt-3 border-t border-gray-100">
                    <span className="flex items-center gap-1 text-red-600 font-medium">
                        <Heart className="h-4 w-4" /> PV: {pokemon.pv}
                    </span>
                    <span className="flex items-center gap-1 text-blue-600 font-medium">
                        <Sword className="h-4 w-4" /> {pokemon.attackName}: {pokemon.attack}
                    </span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center text-sm text-gray-500">
                <span>Generated: {new Date(pokemon.generatedAt).toLocaleDateString()}</span>
                {pokemon.status === PokemonStatus.OWNED ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleResellConfirmation(pokemon.id, pokemon.name, pokemon.rarity)}
                    aria-label={`Resell ${pokemon.name} for ${POKEMON_RESELL_VALUES[pokemon.rarity]} tokens`}
                  >
                    <Coins className="h-4 w-4 mr-1" /> Resell (+{POKEMON_RESELL_VALUES[pokemon.rarity]})
                  </Button>
                ) : (
                  <span className="text-red-500 flex items-center gap-1">
                    <RefreshCw className="h-4 w-4" /> Resold
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={modalTitle}
        onConfirm={modalOnConfirm}
        confirmButtonText="Resell"
        cancelButtonText="Cancel"
        confirmButtonVariant="primary" // Changed to primary for resell
        isLoading={isModalConfirmLoading}
      >
        {modalContent}
      </Modal>
    </div>
  );
};

export default App;