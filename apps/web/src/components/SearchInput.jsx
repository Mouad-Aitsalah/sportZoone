function SearchInput({ value, onChange, placeholder = "Rechercher..." }) {
  return (
    <input
      className="text-input search-input"
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  );
}

export default SearchInput;
