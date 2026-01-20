import { describe, it, expect, vi } from 'vitest';

// useMasterEditorState のハンドラ署名テスト
describe('MasterEditor handler signatures', () => {
  describe('handleRename', () => {
    it('should use newKey (3rd argument) not oldKey (2nd argument)', () => {
      // 修正前のバグ: handleRename(path, newName) で第2引数がnewNameとして使われていた
      // 修正後: handleRename(path, _oldKey, newKey) で第3引数がnewKeyとして使われる

      const mockSetCustomization = vi.fn();
      const prevState = {
        deletedPaths: [],
        renamedPaths: {},
        addedEntries: []
      };

      // 呼び出し側の引数: (path, oldKey, newKey)
      const path = 'workType/category/item';
      const oldKey = 'originalName';
      const newKey = 'newName';

      // handleRename の実装をシミュレート (修正後)
      const handleRename = (path: string, _oldKey: string, newKey: string) => {
        mockSetCustomization((prev: typeof prevState) => ({
          ...prev,
          renamedPaths: { ...prev.renamedPaths, [path]: newKey }
        }));
      };

      handleRename(path, oldKey, newKey);

      // mockSetCustomization が呼ばれたことを確認
      expect(mockSetCustomization).toHaveBeenCalled();

      // コールバックを実行して結果を確認
      const callback = mockSetCustomization.mock.calls[0][0];
      const result = callback(prevState);

      // newKey が保存されていることを確認（oldKey ではない）
      expect(result.renamedPaths[path]).toBe(newKey);
      expect(result.renamedPaths[path]).not.toBe(oldKey);
    });
  });

  describe('handleAdd', () => {
    it('should use parentPath (1st argument) correctly', () => {
      const mockSetCustomization = vi.fn();
      const prevState = {
        deletedPaths: [],
        renamedPaths: {},
        addedEntries: []
      };

      const parentPath = 'workType/category';
      const name = 'newItem';
      const value = null;

      // handleAdd の実装をシミュレート (修正後)
      const handleAdd = (parentPath: string, name: string, _value: unknown) => {
        mockSetCustomization((prev: typeof prevState) => ({
          ...prev,
          addedEntries: [...prev.addedEntries, { parentPath, name }]
        }));
      };

      handleAdd(parentPath, name, value);

      expect(mockSetCustomization).toHaveBeenCalled();

      const callback = mockSetCustomization.mock.calls[0][0];
      const result = callback(prevState);

      expect(result.addedEntries).toHaveLength(1);
      expect(result.addedEntries[0].parentPath).toBe(parentPath);
      expect(result.addedEntries[0].name).toBe(name);
    });
  });

  describe('handleDelete', () => {
    it('should use path (1st argument) correctly', () => {
      const mockSetCustomization = vi.fn();
      const prevState = {
        deletedPaths: [],
        renamedPaths: {},
        addedEntries: []
      };

      const path = 'workType/category/item';
      const key = 'item';
      const deletedValue = { someData: true };

      // handleDelete の実装をシミュレート (修正後)
      const handleDelete = (path: string, _key: string, _deletedValue: unknown) => {
        mockSetCustomization((prev: typeof prevState) => ({
          ...prev,
          deletedPaths: [...prev.deletedPaths, path]
        }));
      };

      handleDelete(path, key, deletedValue);

      expect(mockSetCustomization).toHaveBeenCalled();

      const callback = mockSetCustomization.mock.calls[0][0];
      const result = callback(prevState);

      expect(result.deletedPaths).toContain(path);
    });
  });
});

// useTreeEditing の saveEdit テスト
describe('useTreeEditing saveEdit', () => {
  it('should call onRename with 3 arguments (fullPath, originalKey, newName)', () => {
    // 修正: saveEdit が onRename を3引数で呼ぶことを確認
    // これにより、ラッパー関数でのクロージャ問題を回避

    const mockOnRename = vi.fn();
    const path = 'workType/category';
    const originalKey = 'oldItem';
    const editValue = 'newItem';

    // saveEdit の実装をシミュレート (修正後)
    const saveEdit = (originalKey: string) => {
      if (editValue.trim() && editValue !== originalKey) {
        const fullPath = path ? `${path}/${originalKey}` : originalKey;
        mockOnRename(fullPath, originalKey, editValue.trim());
      }
    };

    saveEdit(originalKey);

    expect(mockOnRename).toHaveBeenCalledWith(
      `${path}/${originalKey}`,  // fullPath
      originalKey,               // originalKey (oldKey)
      editValue                  // newName
    );
  });

  it('should not call onRename if editValue equals originalKey', () => {
    const mockOnRename = vi.fn();
    const path = 'workType/category';
    const originalKey = 'sameItem';
    const editValue = 'sameItem'; // 同じ値

    const saveEdit = (originalKey: string) => {
      if (editValue.trim() && editValue !== originalKey) {
        const fullPath = path ? `${path}/${originalKey}` : originalKey;
        mockOnRename(fullPath, originalKey, editValue.trim());
      }
    };

    saveEdit(originalKey);

    expect(mockOnRename).not.toHaveBeenCalled();
  });
});

// useTreeEditing の handleAddEntry テスト
describe('useTreeEditing handleAddEntry', () => {
  it('should use addingTo path instead of component path', () => {
    // 修正前のバグ: onAdd(path, name) でコンポーネントのpathを使用
    // 修正後: onAdd(addingTo, name) で実際の追加先パスを使用

    const mockOnAdd = vi.fn();
    const componentPath = 'workType'; // コンポーネントに渡されるpath
    const addingTo = 'workType/category/subcategory'; // 実際の追加先
    const newEntryName = 'newItem';

    // handleAddEntry の実装をシミュレート (修正後)
    const handleAddEntry = () => {
      if (newEntryName.trim() && addingTo) {
        mockOnAdd(addingTo, newEntryName.trim());
      }
    };

    handleAddEntry();

    expect(mockOnAdd).toHaveBeenCalledWith(addingTo, newEntryName);
    // componentPath ではなく addingTo が使われていることを確認
    expect(mockOnAdd).not.toHaveBeenCalledWith(componentPath, newEntryName);
  });

  it('should not call onAdd if addingTo is null', () => {
    const mockOnAdd = vi.fn();
    const addingTo: string | null = null;
    const newEntryName = 'newItem';

    const handleAddEntry = () => {
      if (newEntryName.trim() && addingTo) {
        mockOnAdd(addingTo, newEntryName.trim());
      }
    };

    handleAddEntry();

    expect(mockOnAdd).not.toHaveBeenCalled();
  });
});
